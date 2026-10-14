import { Type } from 'class-transformer';
import {
  IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { DeliveryInput, DeliveryLine, DeliverySearch } from '@order-tracking/shared';
import { DATE } from '../contracts/dto';

export class DeliveryLineDto implements DeliveryLine {
  @IsInt() orderItemId: number;

  @IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false }, { message: 'Некоректна кількість' })
  @Min(0, { message: 'Не може бути від’ємною' })
  quantity: number;
}

export class DeliveryDto implements DeliveryInput {
  @Matches(DATE, { message: 'Вкажіть дату поставки' })
  date: string;

  @IsString() @IsNotEmpty({ message: 'Вкажіть номер накладної' }) @MaxLength(100, { message: 'Не довше 100 символів' })
  invoiceNumber: string;

  @IsOptional() @IsString() @MaxLength(2000, { message: 'Не довше 2000 символів' })
  notes: string | null;

  @IsArray() @ValidateNested({ each: true }) @Type(() => DeliveryLineDto)
  lines: DeliveryLineDto[];
}

export class DeliverySearchDto implements DeliverySearch {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() invoice?: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() counterparty?: string;
  @IsOptional() @IsString() item?: string;
  @IsOptional() @Matches(DATE) dateFrom?: string;
  @IsOptional() @Matches(DATE) dateTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
