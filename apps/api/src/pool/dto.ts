import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches, Max,
  MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { PoolContractInput, PoolItemInput, PoolLineInput, PoolSearch, PoolStatus } from '@order-tracking/shared';
import { ContractHeaderDto, DATE, MAX_QTY } from '../contracts/dto';

const qtyOpts = { maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false };

export class PoolItemDto implements PoolItemInput {
  @IsString() @IsNotEmpty({ message: 'Вкажіть найменування' }) @MaxLength(500, { message: 'Не довше 500 символів' })
  name: string;

  @IsString() @IsNotEmpty({ message: 'Вкажіть од. виміру' }) @MaxLength(20, { message: 'Не довше 20 символів' })
  unit: string;

  @IsNumber(qtyOpts, { message: 'Вкажіть кількість (до 3 знаків після коми)' })
  @IsPositive({ message: 'Кількість має бути більшою за 0' })
  @Max(MAX_QTY, { message: 'Завелика кількість' })
  quantity: number;

  @Matches(DATE, { message: 'Вкажіть дату внесення' })
  enteredOn: string;

  @IsOptional() @IsString() @MaxLength(1000, { message: 'Не довше 1000 символів' })
  notes: string | null;
}

export class PoolLineDto implements PoolLineInput {
  @IsInt() poolItemId: number;

  @IsNumber(qtyOpts, { message: 'Вкажіть кількість (до 3 знаків після коми)' })
  @IsPositive({ message: 'Кількість має бути більшою за 0' })
  @Max(MAX_QTY, { message: 'Завелика кількість' })
  quantity: number;
}

export class PoolContractDto extends ContractHeaderDto implements PoolContractInput {
  @IsArray({ message: 'Перетягніть у замовлення хоча б одне найменування.' })
  @ArrayMinSize(1, { message: 'Перетягніть у замовлення хоча б одне найменування.' })
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true }) @Type(() => PoolLineDto)
  lines: PoolLineDto[];
}

export const POOL_STATUSES: PoolStatus[] = ['unallocated', 'partial', 'allocated'];

export class PoolSearchDto implements PoolSearch {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsIn(POOL_STATUSES) status?: PoolStatus;
  @IsOptional() @Matches(DATE) dateFrom?: string;
  @IsOptional() @Matches(DATE) dateTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
