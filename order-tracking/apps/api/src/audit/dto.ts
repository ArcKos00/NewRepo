import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, ValidateNested,
} from 'class-validator';
import type { AuditKind, AuditSearch, UiEvent, UiEventBatch } from '@order-tracking/shared';
import { DATE } from '../contracts/dto';

const KINDS: AuditKind[] = ['changes', 'deletes', 'failed', 'files', 'ui'];

export class AuditSearchDto implements AuditSearch {
  @IsOptional() @IsIn(KINDS) kind?: AuditKind;
  @IsOptional() @IsString() @MaxLength(200) actor?: string;
  @IsOptional() @Matches(/^\d{1,9}$/) contractId?: string;
  @IsOptional() @Matches(DATE) dateFrom?: string;
  @IsOptional() @Matches(DATE) dateTo?: string;
  @IsOptional() @Matches(/^\d{1,18}$/) before?: string;
}

export class UiEventDto implements UiEvent {
  @IsIn(['click', 'navigate']) type: 'click' | 'navigate';
  @IsString() @MaxLength(1000) path: string;
  @IsOptional() @IsString() @MaxLength(300) target?: string;
  @IsOptional() @IsString() @MaxLength(1000) href?: string;
  @IsISO8601() at: string;
}

export class UiEventBatchDto implements UiEventBatch {
  @IsOptional() @IsString() @MaxLength(64) tabId?: string | null;

  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => UiEventDto)
  events: UiEventDto[];
}
