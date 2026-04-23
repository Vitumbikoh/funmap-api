import { Role } from '../enums/role.enum';

export interface JwtUser {
  sub: string;
  phoneNumber: string;
  roles: Role[];
}

