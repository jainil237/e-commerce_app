interface OrderWithRelations {
    id: string;
    orderNumber: string;
    subtotal: {
        toNumber: () => number;
    };
    shippingCharge: {
        toNumber: () => number;
    };
    discount: {
        toNumber: () => number;
    };
    gstAmount: {
        toNumber: () => number;
    };
    total: {
        toNumber: () => number;
    };
    createdAt: Date;
    razorpayPaymentId: string | null;
    user: {
        name: string;
        email: string;
        phone: string;
        id?: string;
    };
    address: {
        label: string;
        line1: string;
        line2: string | null;
        city: string;
        state: string;
        pincode: string;
    };
    items: Array<{
        quantity: number;
        unitPrice: {
            toNumber: () => number;
        };
        gstPercent: number;
        subtotal: {
            toNumber: () => number;
        };
        product: {
            name: string;
            sku: string;
        };
    }>;
}
export declare function generateInvoicePdf(order: OrderWithRelations): Promise<string>;
export {};
//# sourceMappingURL=invoice.service.d.ts.map