export class PayChanguVerifyDataDto {
  tx_ref?: string;
  reference?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  [key: string]: unknown;
}

export class PayChanguVerifyResponseDto {
  status?: string;
  message?: string;
  data?: PayChanguVerifyDataDto;
  [key: string]: unknown;
}
