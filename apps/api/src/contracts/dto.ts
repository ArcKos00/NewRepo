import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength,
  Min, ValidateIf, ValidateNested,
} from 'class-validator';
import type {
  ContractInput, ContractItemInput, ContractSearch, ContractStatus, ShortfallInput,
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

export class ContractDto implements ContractInput {
  @IsString() @IsNotEmpty({ message: 'Вкажіть номер договору' }) @MaxLength(100, { message: 'Не довше 100 символів' })
  number: string;

  @IsString() @IsNotEmpty({ message: 'Вкажіть контрагента' }) @MaxLength(300, { message: 'Не довше 300 символів' })
  counterparty: string;

  @Matches(DATE, { message: 'Вкажіть дату договору' })
  contractDate: string;

  @ValidateIf((o) => o.expectedDeliveryDate !== null && o.expectedDeliveryDate !== undefined && o.expectedDeliveryDate !== '')
  @Matches(DATE, { message: 'Некоректна дата' })
  expectedDeliveryDate: string | null;

  @IsOptional() @IsString() @MaxLength(2000, { message: 'Не довше 2000 символів' })
  notes: string | null;

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

const STATUSES: ContractStatus[] = ['waiting', 'partial', 'overdue', 'completed'];

export class SearchDto implements ContractSearch {
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() counterparty?: string;
  @IsOptional() @IsString() item?: string;
  @IsOptional() @Matches(DATE) dateFrom?: string;
  @IsOptional() @Matches(DATE) dateTo?: string;
  @IsOptional() @IsIn(STATUSES) status?: ContractStatus;
}
