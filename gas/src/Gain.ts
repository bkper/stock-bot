class Gain {

    private historical: boolean;

    private saleAmount: Bkper.Amount;
    private purchaseAmount: Bkper.Amount;

    private fwdSaleAmount: Bkper.Amount;
    private fwdPurchaseAmount: Bkper.Amount;

    constructor(historical: boolean, saleAmount: Bkper.Amount, purchaseAmount: Bkper.Amount, fwdSaleAmount: Bkper.Amount, fwdPurchaseAmount: Bkper.Amount) {
        this.historical = historical
        this.saleAmount = saleAmount
        this.purchaseAmount = purchaseAmount
        this.fwdSaleAmount = fwdSaleAmount
        this.fwdPurchaseAmount = fwdPurchaseAmount
    }

    plus(gain: Gain) {
        this.saleAmount = this.saleAmount.plus(gain.saleAmount)
        this.purchaseAmount = this.purchaseAmount.plus(gain.purchaseAmount)
        this.fwdSaleAmount = this.fwdSaleAmount.plus(gain.saleAmount)
        this.fwdPurchaseAmount = this.fwdPurchaseAmount.plus(gain.fwdPurchaseAmount)
    }

    getGain(): Bkper.Amount {
        return this.getSaleAmount().minus(this.getPurchaseAmount());
    }

    getPurchaseAmount(): Bkper.Amount {
        return this.historical ? this.purchaseAmount : this.fwdPurchaseAmount;
    }
    
    getSaleAmount(): Bkper.Amount {
        return this.historical ? this.saleAmount : this.fwdSaleAmount;
    }



}