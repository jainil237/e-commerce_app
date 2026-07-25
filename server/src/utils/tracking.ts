import { getStoreConfig } from './config'

export function getTrackingUrl(partner: string, awb: string): string {
  const config = getStoreConfig()
  const trackingUrls = config.courier?.trackingUrls || {}
  
  // Try case-insensitive matching if direct map fails
  const partnerKey = Object.keys(trackingUrls).find(
    (key) => key.toLowerCase() === partner.toLowerCase()
  )

  const template = partnerKey ? trackingUrls[partnerKey as keyof typeof trackingUrls] : null
  
  if (!template) {
    return `https://www.google.com/search?q=track+${encodeURIComponent(partner)}+${encodeURIComponent(awb)}`
  }
  
  return template.replace('{awb}', awb)
}
