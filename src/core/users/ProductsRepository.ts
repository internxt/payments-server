import { UserType } from './User';

export interface Product {
  paymentGatewayId: string;
  userType: UserType
}

export interface ProductsRepository {
  findByType(type: UserType): Promise<Product[]>
}
