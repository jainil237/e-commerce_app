import { redirect } from 'next/navigation'

export default function OrdersRedirectPage() {
  // We use /account/orders for all order tracking logic
  redirect('/account/orders')
}
