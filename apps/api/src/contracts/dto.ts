import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength,
  Min, ValidateIf, ValidateNested,
} from 'class-validator';
import type {
  ContractInput, ContractItemInput, ContractSearch, ContractStage, ContractStatus, ShortfallInput,
} from '@order-tracking/shared';

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_QTY = 1e9;
const qtyOpts = { maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false };

export class ContractItemDto implements ContractItemInput {
  @IsOptional() @IsInt() id?: number;

  @IsString() @IsNotEmpty({ message: 'Вкажіть найменування' }) @MaxLength(500, { message: 'Не довше 500 символів' })
  name: string;

  @IsString() @IsNotEmpty({ message: 'Вкажіть од. виміру' }) @MaxLength(20, { message: 'Не довше 20 символів' })
  unit: string;

  @IsNumber(qtyOpts, { message: 'Вкажіть кількість (до 3 знаків після коми)' })
  @IsPositive({ message: 'Кількість має бути більшою за 0' })
  @Max(MAX_QTY, { message: 'Завелика кількість' })
  quantity: number;
}

export const STAGES: ContractStage[] = ['planned', 'tender_announced', 'tender_held', 'draft'];

/** Етап з тіла запиту: stage, а якщо його нема — застарілий прапорець draft. null — підписано. */
export const stageOf = (o: { stage?: ContractStage | null; draft?: boolean }): ContractStage | null =>
  o.stage !== undefined ? o.stage : o.draft ? 'draft' : null;

const blank = (v: unknown) => v === null || v === undefined || v === '';
/** Поле можна лишити порожнім, лише поки договір не підписано (обов'язковість для підписаного — у checkCommon). */
const unlessBlankUnsigned = ValidateIf((o, v) => !stageOf(o) || !blank(v));

/** Поля договору без найменувань — спільні для звичайної форми і договору з нерозподіленого. */
export class ContractHeaderDto implements Omit<ContractInput, 'items'> {
  @unlessBlankUnsigned
  @IsString() @IsNotEmpty({ message: 'Вкажіть номер договору' }) @MaxLength(100, { message: 'Не довше 100 символів' })
  number: string | null;

  @unlessBlankUnsigned
  @IsString() @IsNotEmpty({ message: 'Вкажіть контрагента' }) @MaxLength(300, { message: 'Не довше 300 символів' })
  counterparty: string | null;

  @unlessBlankUnsigned
  @Matches(DATE, { message: 'Вкажіть дату договору' })
  contractDate: string | null;

  @ValidateIf((o) => o.expectedDeliveryDate !== null && o.expectedDeliveryDate !== undefined && o.expectedDeliveryDate !== '')
  @Matches(DATE, { message: 'Некоректна дата' })
  expectedDeliveryDate: string | null;

  @IsOptional() @IsString() @MaxLength(2000, { message: 'Не довше 2000 символів' })
  notes: string | null;

  @IsOptional() @IsIn(STAGES, { message: 'Невідомий етап' }) stage?: ContractStage | null;

  @IsOptional() @IsBoolean() draft?: boolean;
}

export class ContractDto extends ContractHeaderDto implements ContractInput {
  @IsArray({ message: 'Додайте хоча б одне найменування.' })
  @ArrayMinSize(1, { message: 'Додайте хоча б одне найменування.' })
  @ValidateNested({ each: true }) @Type(() => ContractItemDto)
  items: ContractItemDto[];
}

export class ShortfallItemDto {
  @IsInt() orderItemId: number;

  @IsNumber(qtyOpts, { message: 'Некоректна кількість' }) @Min(0, { message: 'Не може бути від’ємною' })
  cancelled: number;

  @IsOptional() @IsString() @MaxLength(1000, { message: 'Не довше 1000 символів' })
  cancelReason: string | null;
}

export class ShortfallDto implements ShortfallInput {
  @ValidateIf((o) => o.expectedDeliveryDate !== null && o.expectedDeliveryDate !== undefined && o.expectedDeliveryDate !== '')
  @Matches(DATE, { message: 'Некоректна дата' })
  expectedDeliveryDate: string | null;

  @IsArray() @ValidateNested({ each: true }) @Type(() => ShortfallItemDto)
  items: ShortfallItemDto[];
}

/** Застарілий PUT /contracts/:id/draft (вкладки до етапів). */
export class DraftDto {
  @IsBoolean() draft: boolean;
}

export class StageDto {
  @ValidateIf((o) => o.stage !== null) @IsIn(STAGES, { message: 'Невідомий етап' }) stage: ContractStage | null;
}

const STATUSES: ContractStatus[] = [...STAGES, 'waiting', 'partial', 'overdue', 'completed'];

export const PAGE_SIZE = 25;

export class SearchDto implements ContractSearch {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() counterparty?: string;
  @IsOptional() @IsString() item?: string;
  @IsOptional() @Matches(DATE) dateFrom?: string;
  @IsOptional() @Matches(DATE) dateTo?: string;
  @IsOptional() @IsIn(STATUSES) status?: ContractStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
