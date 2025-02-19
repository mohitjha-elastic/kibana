/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiComboBox } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useCallback } from 'react';
import { useMetricsDataViewContext } from '../../../../containers/metrics_source';
import type { MetricsExplorerOptions } from '../hooks/use_metrics_explorer_options';

interface Props {
  options: MetricsExplorerOptions;
  onChange: (groupBy: string | null | string[]) => void;
}

export const MetricsExplorerGroupBy = ({ options, onChange }: Props) => {
  const { metricsView } = useMetricsDataViewContext();
  const handleChange = useCallback(
    (selectedOptions: Array<{ label: string }>) => {
      const groupBy = selectedOptions.map((option) => option.label);
      onChange(groupBy);
    },
    [onChange]
  );

  const selectedOptions = Array.isArray(options.groupBy)
    ? options.groupBy.map((field) => ({ label: field }))
    : options.groupBy
    ? [{ label: options.groupBy }]
    : [];

  const comboOptions = (metricsView?.fields ?? [])
    .filter((f) => f.aggregatable && f.type === 'string')
    .map((f) => ({ label: f.name }));

  return (
    <EuiComboBox
      data-test-subj="metricsExplorer-groupBy"
      placeholder={i18n.translate('xpack.infra.metricsExplorer.groupByLabel', {
        defaultMessage: 'Everything',
      })}
      aria-label={i18n.translate('xpack.infra.metricsExplorer.groupByAriaLabel', {
        defaultMessage: 'Graph per',
      })}
      fullWidth
      singleSelection={false}
      selectedOptions={selectedOptions}
      options={comboOptions}
      onChange={handleChange}
      isClearable={true}
    />
  );
};
