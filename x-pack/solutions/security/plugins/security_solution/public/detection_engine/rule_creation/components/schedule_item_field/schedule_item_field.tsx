/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiSelectProps, EuiFieldNumberProps } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFieldNumber,
  EuiFormRow,
  EuiSelect,
  transparentize,
} from '@elastic/eui';
import { isEmpty } from 'lodash/fp';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import type { FieldHook } from '../../../../shared_imports';
import { getFieldValidityAndErrorMessage } from '../../../../shared_imports';

import * as I18n from './translations';

interface ScheduleItemProps {
  field: FieldHook<string>;
  dataTestSubj: string;
  idAria: string;
  isDisabled: boolean;
  minimumValue?: number;
  timeTypes?: string[];
  fullWidth?: boolean;
}

const timeTypeOptions = [
  { value: 's', text: I18n.SECONDS },
  { value: 'm', text: I18n.MINUTES },
  { value: 'h', text: I18n.HOURS },
  { value: 'd', text: I18n.DAYS },
];

// move optional label to the end of input
const StyledLabelAppend = styled(EuiFlexItem)`
  &.euiFlexItem {
    margin-left: 31px;
  }
`;

const StyledEuiFormRow = styled(EuiFormRow)`
  max-width: none;

  .euiFormControlLayout__append {
    padding-inline: 0 !important;
  }

  .euiFormControlLayoutIcons {
    color: ${({ theme }) => theme.eui.euiColorPrimary};
  }
`;

const MyEuiSelect = styled(EuiSelect)`
  min-width: 106px; // Preserve layout when disabled & dropdown arrow is not rendered
  background: ${({ theme }) =>
    transparentize(theme.eui.euiColorPrimary, 0.1)} !important; // Override focus states etc.
  color: ${({ theme }) => theme.eui.euiColorPrimary};
  box-shadow: none;
`;

const getNumberFromUserInput = (input: string, minimumValue = 0): number => {
  const number = parseInt(input, 10);
  if (Number.isNaN(number)) {
    return minimumValue;
  } else {
    return Math.max(minimumValue, Math.min(number, Number.MAX_SAFE_INTEGER));
  }
};

export const ScheduleItemField = ({
  dataTestSubj,
  field,
  idAria,
  isDisabled,
  minimumValue = 0,
  timeTypes = ['s', 'm', 'h'],
  fullWidth = false,
}: ScheduleItemProps) => {
  const [timeType, setTimeType] = useState(timeTypes[0]);
  const [timeVal, setTimeVal] = useState<number>(0);
  const { isInvalid, errorMessage } = getFieldValidityAndErrorMessage(field);
  const { value, setValue } = field;

  const onChangeTimeType = useCallback<NonNullable<EuiSelectProps['onChange']>>(
    (e) => {
      setTimeType(e.target.value);
      setValue(`${timeVal}${e.target.value}`);
    },
    [setValue, timeVal]
  );

  const onChangeTimeVal = useCallback<NonNullable<EuiFieldNumberProps['onChange']>>(
    (e) => {
      const sanitizedValue = getNumberFromUserInput(e.target.value, minimumValue);
      setTimeVal(sanitizedValue);
      setValue(`${sanitizedValue}${timeType}`);
    },
    [minimumValue, setValue, timeType]
  );

  useEffect(() => {
    if (value !== `${timeVal}${timeType}`) {
      const filterTimeVal = value.match(/\d+/g);
      const filterTimeType = value.match(/[a-zA-Z]+/g);
      if (
        !isEmpty(filterTimeVal) &&
        filterTimeVal != null &&
        !isNaN(Number(filterTimeVal[0])) &&
        Number(filterTimeVal[0]) !== Number(timeVal)
      ) {
        setTimeVal(Number(filterTimeVal[0]));
      }
      if (
        !isEmpty(filterTimeType) &&
        filterTimeType != null &&
        timeTypes.includes(filterTimeType[0]) &&
        filterTimeType[0] !== timeType
      ) {
        setTimeType(filterTimeType[0]);
      }
    }
  }, [timeType, timeTypes, timeVal, value]);

  // EUI missing some props
  const rest = { disabled: isDisabled };
  const label = useMemo(
    () => (
      <EuiFlexGroup gutterSize="s" justifyContent="flexStart" alignItems="center">
        <EuiFlexItem grow={false} component="span">
          {field.label}
        </EuiFlexItem>
        <StyledLabelAppend grow={false} component="span">
          {field.labelAppend}
        </StyledLabelAppend>
      </EuiFlexGroup>
    ),
    [field.label, field.labelAppend]
  );

  return (
    <StyledEuiFormRow
      label={label}
      helpText={field.helpText}
      error={errorMessage}
      isInvalid={isInvalid}
      fullWidth={fullWidth}
      data-test-subj={dataTestSubj}
      describedByIds={idAria ? [idAria] : undefined}
    >
      <EuiFieldNumber
        append={
          <MyEuiSelect
            fullWidth
            options={timeTypeOptions.filter((type) => timeTypes.includes(type.value))}
            onChange={onChangeTimeType}
            value={timeType}
            aria-label={field.label}
            data-test-subj="timeType"
            {...rest}
          />
        }
        fullWidth
        min={minimumValue}
        max={Number.MAX_SAFE_INTEGER}
        onChange={onChangeTimeVal}
        value={timeVal}
        data-test-subj="interval"
        {...rest}
      />
    </StyledEuiFormRow>
  );
};
