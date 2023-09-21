import { EventInfo, Marketplace, Product, RegisterBuyInfo, Reward, Access } from "../../../../Developer/sdk/dist"
import { firestore } from "firebase-admin"
import { User } from "../types"

const converter = <T>() => ({
  toFirestore: (data: T) => data,
  fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot<T>) => snap.data() as T
})

const dataPoint = <T extends firestore.DocumentData>(collectionPath: string) => firestore().collection(collectionPath).withConverter(converter<T>())

const db = {
  users: dataPoint<User>('users'),
  userPurchases: (userId: string) => dataPoint<RegisterBuyInfo>(`users/${userId}/purchases`),
  userProducts: (userId: string) => dataPoint<Product>(`users/${userId}/products`),
  userRewards: (userId: string) => dataPoint<Reward>(`users/${userId}/rewards`),
  marketplace: dataPoint<Marketplace>('marketplace'), 
  marketplaceRequests: (marketplace: string) => dataPoint<Access>(`marketplace/${marketplace}/requests`),
  products: dataPoint<Product>('products'),
  productSale: (productAddress: string) => dataPoint<RegisterBuyInfo>(`products/${productAddress}`),
  events: (eventType: string) => dataPoint<EventInfo>(`events/${eventType}`),
}

export { db }
export default db
