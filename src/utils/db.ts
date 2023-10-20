import { InitProductInfo, DirectPayInfo, InstructionType } from "../../../../Developer/sdk/dist"
import { firestore } from "firebase-admin"
import { User } from "../types"

const converter = <T>() => ({
  toFirestore: (data: T) => data,
  fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot<T>) => snap.data() as T
})

const dataPoint = <T extends firestore.DocumentData>(collectionPath: string) => firestore().collection(collectionPath).withConverter(converter<T>())

const db = {
  users: dataPoint<User>('users'),
  userPurchases: (userId: string) => dataPoint<DirectPayEvent>(`users/${userId}/purchases`),
  userProducts: (userId: string) => dataPoint<ProductEvent>(`users/${userId}/products`),
  products: dataPoint<ProductEvent>('products'),
  productSales: (productAddress: string) => dataPoint<DirectPayEvent>(`products/${productAddress}`),
}

export { db }
export default db

type DirectPayEvent = DirectPayInfo & {
  type: InstructionType
  blockTime: number
}

type ProductEvent = InitProductInfo & {
  type: InstructionType
  blockTime: number
}