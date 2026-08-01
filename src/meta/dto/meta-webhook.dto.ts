import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class MetaLeadgenValueDto {
  @IsOptional()
  leadgen_id?: string | number;

  @IsOptional()
  page_id?: string | number;

  @IsOptional()
  form_id?: string | number;

  @IsOptional()
  ad_id?: string | number;

  @IsOptional()
  adgroup_id?: string | number;

  @IsOptional()
  created_time?: number;
}

export class MetaWebhookChangeDto {
  @IsString()
  field!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => MetaLeadgenValueDto)
  value!: MetaLeadgenValueDto;
}

export class MetaWebhookEntryDto {
  @IsOptional()
  id?: string | number;

  @IsOptional()
  time?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaWebhookChangeDto)
  changes!: MetaWebhookChangeDto[];
}

export class MetaWebhookDto {
  @IsIn(['page'])
  object!: 'page';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaWebhookEntryDto)
  entry!: MetaWebhookEntryDto[];
}
