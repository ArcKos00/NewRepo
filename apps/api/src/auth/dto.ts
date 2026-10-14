import { IsString, MaxLength } from 'class-validator';
import type { LoginInput } from '@order-tracking/shared';

export class LoginDto implements LoginInput {
  @IsString() @MaxLength(200) username: string;
  @IsString() @MaxLength(200) password: string;
}
