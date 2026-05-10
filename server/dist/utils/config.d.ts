interface StoreConfig {
    store: {
        name: string;
        tagline: string;
        logo: string;
        favicon: string;
        primaryColor: string;
        accentColor: string;
        currency: string;
        currencySymbol: string;
        locale: string;
        gstNumber: string;
        address: {
            line1: string;
            city: string;
            state: string;
            pincode: string;
            country: string;
        };
        contact: {
            phone: string;
            email: string;
            whatsapp: string;
        };
        social: {
            instagram: string;
            facebook: string;
            twitter: string;
        };
        meta: {
            title: string;
            description: string;
            ogImage: string;
        };
    };
    features: {
        guestCheckout: boolean;
        wishlist: boolean;
        productReviews: boolean;
        couponCodes: boolean;
        whatsappSupport: boolean;
        codEnabled: boolean;
        emailService: boolean;
    };
    courier: {
        partners: string[];
        defaultPartner: string;
        trackingUrls: Record<string, string>;
    };
    razorpay: {
        keyIdEnvVar: string;
        keySecretEnvVar: string;
        webhookSecretEnvVar: string;
    };
    shipping: {
        freeShippingAbove: number;
        baseShippingCharge: number;
        estimatedDeliveryDays: {
            metro: number;
            tier2: number;
            rest: number;
        };
    };
    homepage: {
        heroBanner: {
            headline: string;
            subtext: string;
            ctaText: string;
            ctaLink: string;
            backgroundImage: string;
        };
        promotionalBanner: {
            text: string;
            bgColor: string;
            textColor: string;
        };
    };
    invoice: {
        prefix: string;
        startNumber: number;
        termsAndConditions: string;
        logoForPdf: string;
        footerNote: string;
    };
    seo: {
        googleAnalyticsId: string;
        facebookPixelId: string;
    };
}
export declare function getStoreConfig(): StoreConfig;
export declare function getTrackingUrl(courier: string, awb: string): string;
export {};
//# sourceMappingURL=config.d.ts.map