interface OrderUser {
    name: string;
    email: string;
    phone: string;
}
interface OrderAddress {
    label: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
}
interface OrderItem {
    quantity: number;
    unitPrice: {
        toNumber: () => number;
    };
    product: {
        name: string;
    };
}
interface OrderWithRelations {
    id: string;
    orderNumber: string;
    total: {
        toNumber: () => number;
    };
    createdAt: Date;
    user: OrderUser;
    address: OrderAddress;
    items: OrderItem[];
}
export declare function sendOrderConfirmationEmail(order: OrderWithRelations, invoicePath: string): Promise<void>;
export declare function sendInvoiceEmail(order: OrderWithRelations, invoicePath: string): Promise<void>;
export declare function sendOtpEmail(email: string, otp: string, purpose: 'verification' | 'password-reset'): Promise<void>;
interface ShippingUpdateOrder {
    id: string;
    orderNumber: string;
    user: {
        name: string;
        email: string;
    };
}
interface ShippingUpdateDetails {
    status: string;
    courierPartner: string;
    awbNumber?: string | null;
    trackingUrl?: string | null;
    expectedBy?: Date | null;
}
export declare function sendShippingUpdateEmail(order: ShippingUpdateOrder, shipping: ShippingUpdateDetails): Promise<void>;
interface CancelledOrder {
    id: string;
    orderNumber: string;
    total: {
        toNumber: () => number;
    };
    user: {
        name: string;
        email: string;
    };
}
export declare function sendOrderCancelledEmail(order: CancelledOrder): Promise<void>;
export {};
//# sourceMappingURL=email.service.d.ts.map