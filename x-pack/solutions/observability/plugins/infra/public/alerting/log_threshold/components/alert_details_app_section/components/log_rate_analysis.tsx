/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useEffect, useMemo, useState } from 'react';
import moment from 'moment';

import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiTitle } from '@elastic/eui';

import { FormattedMessage } from '@kbn/i18n-react';
import type { DataView } from '@kbn/data-views-plugin/common';
import {
  LOG_RATE_ANALYSIS_TYPE,
  type LogRateAnalysisType,
} from '@kbn/aiops-log-rate-analysis/log_rate_analysis_type';
import { getLogRateAnalysisParametersFromAlert } from '@kbn/aiops-log-rate-analysis/get_log_rate_analysis_parameters_from_alert';
import { LogRateAnalysisContent, type LogRateAnalysisResultsData } from '@kbn/aiops-plugin/public';
import type { Rule } from '@kbn/alerting-plugin/common';
import type { TopAlert } from '@kbn/observability-plugin/public';
import { ALERT_END } from '@kbn/rule-data-utils';
import type { Message } from '@kbn/observability-ai-assistant-plugin/public';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { i18n } from '@kbn/i18n';
import { pick, orderBy } from 'lodash';
import { decodeOrThrow } from '@kbn/io-ts-utils';
import { Color, colorTransformer } from '../../../../../../common/color_palette';
import { useKibanaContextForPlugin } from '../../../../../hooks/use_kibana';
import type {
  CountRuleParams,
  PartialRuleParams,
} from '../../../../../../common/alerting/logs/log_threshold';
import {
  isRatioRuleParams,
  ruleParamsRT,
} from '../../../../../../common/alerting/logs/log_threshold';
import { getESQueryForLogRateAnalysis } from '../log_rate_analysis_query';

export interface AlertDetailsLogRateAnalysisSectionProps {
  rule: Rule<PartialRuleParams>;
  alert: TopAlert<Record<string, any>>;
}

interface SignificantFieldValue {
  field: string;
  value: string | number;
  docCount: number;
  pValue: number | null;
}

export const LogRateAnalysis: FC<AlertDetailsLogRateAnalysisSectionProps> = ({ rule, alert }) => {
  const { services } = useKibanaContextForPlugin();
  const { dataViews, logsShared, observabilityAIAssistant } = services;
  const [dataView, setDataView] = useState<DataView | undefined>();
  const [esSearchQuery, setEsSearchQuery] = useState<QueryDslQueryContainer | undefined>();
  const [logRateAnalysisParams, setLogRateAnalysisParams] = useState<
    | { logRateAnalysisType: LogRateAnalysisType; significantFieldValues: SignificantFieldValue[] }
    | undefined
  >();

  const validatedParams = useMemo(() => decodeOrThrow(ruleParamsRT)(rule.params), [rule]);

  useEffect(() => {
    const getDataView = async () => {
      const { timestampField, dataViewReference } =
        await logsShared.logViews.client.getResolvedLogView(validatedParams.logView);

      if (dataViewReference.id) {
        const logDataView = await dataViews.get(dataViewReference.id);
        setDataView(logDataView);
        getQuery(timestampField);
      }
    };

    const getQuery = (timestampField: string) => {
      const esSearchRequest = getESQueryForLogRateAnalysis(
        validatedParams as CountRuleParams,
        timestampField,
        alert,
        validatedParams.groupBy
      ) as QueryDslQueryContainer;

      if (esSearchRequest) {
        setEsSearchQuery(esSearchRequest);
      }
    };

    if (!isRatioRuleParams(validatedParams)) {
      getDataView();
    }
  }, [validatedParams, alert, dataViews, logsShared]);

  const { timeRange, windowParameters } = useMemo(() => {
    const alertStartedAt = moment(alert.start).toISOString();
    const alertEndedAt = alert.fields[ALERT_END]
      ? moment(alert.fields[ALERT_END]).toISOString()
      : undefined;
    const timeSize = alert.fields['kibana.alert.rule.parameters']?.timeSize as number | undefined;
    const timeUnit = alert.fields['kibana.alert.rule.parameters']?.timeUnit as
      | moment.unitOfTime.DurationConstructor
      | undefined;

    return getLogRateAnalysisParametersFromAlert({
      alertStartedAt,
      alertEndedAt,
      timeSize,
      timeUnit,
    });
  }, [alert]);

  const logRateAnalysisTitle = i18n.translate(
    'xpack.infra.logs.alertDetails.logRateAnalysisTitle',
    {
      defaultMessage: 'Possible causes and remediations',
    }
  );

  const onAnalysisCompleted = (analysisResults: LogRateAnalysisResultsData | undefined) => {
    const significantFieldValues = orderBy(
      analysisResults?.significantItems?.map((item) => ({
        field: item.fieldName,
        value: item.fieldValue,
        docCount: item.doc_count,
        pValue: item.pValue,
      })),
      ['pValue', 'docCount'],
      ['asc', 'asc']
    ).slice(0, 50);

    const logRateAnalysisType = analysisResults?.analysisType;
    setLogRateAnalysisParams(
      significantFieldValues && logRateAnalysisType
        ? { logRateAnalysisType, significantFieldValues }
        : undefined
    );
  };

  const messages = useMemo<Message[] | undefined>(() => {
    const hasLogRateAnalysisParams =
      logRateAnalysisParams && logRateAnalysisParams.significantFieldValues?.length > 0;

    if (!hasLogRateAnalysisParams || !observabilityAIAssistant) {
      return undefined;
    }

    const { logRateAnalysisType } = logRateAnalysisParams;

    const header = 'Field name,Field value,Doc count,p-value';
    const rows = logRateAnalysisParams.significantFieldValues
      .map((item) => Object.values(item).join(','))
      .join('\n');

    return observabilityAIAssistant.getContextualInsightMessages({
      message:
        'Can you identify possible causes and remediations for these log rate analysis results',
      instructions: `You are an observability expert using Elastic Observability Suite on call being consulted about a log threshold alert that got triggered by a ${logRateAnalysisType} in log messages. Your job is to take immediate action and proceed with both urgency and precision.
      "Log Rate Analysis" is an AIOps feature that uses advanced statistical methods to identify reasons for increases and decreases in log rates. It makes it easy to find and investigate causes of unusual spikes or dips by using the analysis workflow view.
      You are using "Log Rate Analysis" and ran the statistical analysis on the log messages which occured during the alert.
      You received the following analysis results from "Log Rate Analysis" which list statistically significant co-occuring field/value combinations sorted from most significant (lower p-values) to least significant (higher p-values) that ${
        logRateAnalysisType === LOG_RATE_ANALYSIS_TYPE.SPIKE
          ? 'contribute to the log rate spike'
          : 'are less or not present in the log rate dip'
      }:

      ${
        logRateAnalysisType === LOG_RATE_ANALYSIS_TYPE.SPIKE
          ? 'The median log rate in the selected deviation time range is higher than the baseline. Therefore, the results shows statistically significant items within the deviation time range that are contributors to the spike. The "doc count" column refers to the amount of documents in the deviation time range.'
          : 'The median log rate in the selected deviation time range is lower than the baseline. Therefore, the analysis results table shows statistically significant items within the baseline time range that are less in number or missing within the deviation time range. The "doc count" column refers to the amount of documents in the baseline time range.'
      }

      ${header}
      ${rows}

      Based on the above analysis results and your observability expert knowledge, output the following:
      Analyse the type of these logs and explain their usual purpose (1 paragraph).
      ${
        logRateAnalysisType === LOG_RATE_ANALYSIS_TYPE.SPIKE
          ? 'Based on the type of these logs do a root cause analysis on why the field and value combinations from the analysis results are causing this log rate spike (2 parapraphs)'
          : 'Based on the type of these logs explain why the statistically significant field and value combinations are less in number or missing from the log rate dip with concrete examples based on the analysis results data which contains items that are present in the baseline time range and are missing or less in number in the deviation time range (2 paragraphs)'
      }.
      ${
        logRateAnalysisType === LOG_RATE_ANALYSIS_TYPE.SPIKE
          ? 'Recommend concrete remediations to resolve the root cause (3 bullet points).'
          : ''
      }

      Do not mention individual p-values from the analysis results.
      Do not repeat the full list of field names and field values back to the user.
      Do not guess, just say what you are sure of. Do not repeat the given instructions in your output.`,
    });
  }, [logRateAnalysisParams, observabilityAIAssistant]);

  if (!dataView || !esSearchQuery) return null;

  return (
    <EuiPanel hasBorder={true} data-test-subj="logRateAnalysisAlertDetails">
      <EuiFlexGroup direction="column" gutterSize="none" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h2>
              <FormattedMessage
                id="xpack.infra.logs.alertDetails.logRateAnalysis.sectionTitle"
                defaultMessage="Log Rate Analysis"
              />
            </h2>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem>
          <LogRateAnalysisContent
            dataView={dataView}
            timeRange={timeRange}
            esSearchQuery={esSearchQuery}
            initialAnalysisStart={windowParameters}
            barColorOverride={colorTransformer(Color.color0)}
            barHighlightColorOverride={colorTransformer(Color.color1)}
            onAnalysisCompleted={onAnalysisCompleted}
            appContextValue={{
              embeddingOrigin: 'observability_log_threshold_alert_details',
              ...pick(services, [
                'analytics',
                'application',
                'data',
                'executionContext',
                'charts',
                'fieldFormats',
                'http',
                'notifications',
                'share',
                'storage',
                'uiSettings',
                'unifiedSearch',
                'theme',
                'userProfile',
                'lens',
                'i18n',
              ]),
            }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiFlexGroup direction="column" gutterSize="m">
        {observabilityAIAssistant?.ObservabilityAIAssistantContextualInsight && messages ? (
          <EuiFlexItem grow={false}>
            <observabilityAIAssistant.ObservabilityAIAssistantContextualInsight
              title={logRateAnalysisTitle}
              messages={messages}
            />
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>
    </EuiPanel>
  );
};
