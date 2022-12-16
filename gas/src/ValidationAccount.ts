class ValidationAccount {

    private account: Bkper.Account;

    private uncheckedPurchases: Bkper.Transaction[] = [];
    private uncheckedSales: Bkper.Transaction[] = [];

    constructor(account: Bkper.Account) {
        this.account = account;
    }

    getAccount(): Bkper.Account {
        return this.account;
    }

    pushUncheckedPurchase(purchase: Bkper.Transaction): void {
        this.uncheckedPurchases.push(purchase);
    }

    pushUncheckedSale(sale: Bkper.Transaction): void {
        this.uncheckedSales.push(sale);
    }

    needsRebuild(): boolean {
        return this.account.getProperty(NEEDS_REBUILD_PROP) ? true : false;
    }

    hasUncalculatedResults(): boolean {
        return (this.uncheckedPurchases.length > 0 && this.uncheckedSales.length > 0) ? true : false;
    }

}
