class RealizedResultsProcessor {

    private stockBook: Bkper.Book;
    private financialBook: Bkper.Book;
    private baseBook: Bkper.Book;

    private stockBookTransactionsToCreate = new Map<string, Bkper.Transaction>();
    private stockBookTransactionsToUpdateMap = new Map<string, Bkper.Transaction>();
    private stockBookTransactionsToCheckMap = new Map<string, Bkper.Transaction>();
    private financialBookTransactionsToCreateMap = new Map<string, Bkper.Transaction>();
    private baseBookTransactionsToCreateMap = new Map<string, Bkper.Transaction>();

    private mtmBalance = BkperApp.newAmount(0);

    constructor(stockBook: Bkper.Book, financialBook: Bkper.Book, baseBook: Bkper.Book) {
        this.stockBook = stockBook;
        this.financialBook = financialBook;
        this.baseBook = baseBook;
    }

    private getRemoteId(transaction: Bkper.Transaction): string {
        const remoteIds = transaction.getRemoteIds();
        return remoteIds.length > 0 ? remoteIds[0] : '';
    }

    private isMtmTransaction(transaction: Bkper.Transaction): boolean {
        const remoteId = this.getRemoteId(transaction);
        if (remoteId && remoteId.startsWith('mtm_')) {
            return true;
        }
        return false;
    }

    setStockBookTransactionToCreate(transaction: Bkper.Transaction): void {
        // Use remoteId as key since transaction does not have an id yet
        this.stockBookTransactionsToCreate.set(this.getRemoteId(transaction), transaction);
    }

    setStockBookTransactionToUpdate(transaction: Bkper.Transaction): void {
        this.stockBookTransactionsToUpdateMap.set(transaction.getId(), transaction);
    }

    setStockBookTransactionToCheck(transaction: Bkper.Transaction): void {
        this.stockBookTransactionsToCheckMap.set(transaction.getId(), transaction);
    }

    setFinancialBookTransactionToCreate(transaction: Bkper.Transaction): void {
        // Use remoteId as key since transaction does not have an id yet
        this.financialBookTransactionsToCreateMap.set(this.getRemoteId(transaction), transaction);
        // Update MTM balance
        if (this.isMtmTransaction(transaction)) {
            const amount = transaction.getCreditAccount().isPermanent() ? transaction.getAmount().times(-1) : transaction.getAmount();
            this.mtmBalance = this.mtmBalance.plus(amount);
        }
    }

    setBaseBookTransactionToCreate(transaction: Bkper.Transaction): void {
        // Use remoteId as key since transaction does not have an id yet
        this.baseBookTransactionsToCreateMap.set(this.getRemoteId(transaction), transaction);
    }

    getMtmBalance(): Bkper.Amount {
        return this.mtmBalance;
    }

    fireBatchOperations(): void {

        // Fire batch creation of stock book transactions first in order to get new ids
        const newStockBookTransactions = this.fireBatchCreateStockBookTransactions();

        // Fix remoteIds references on RR, FX and MTM transactions
        for (const newStockBookTx of newStockBookTransactions) {

            const oldId = BotService.getRrpTemporaryId(newStockBookTx);
            const newId = newStockBookTx.getId();

            // RR
            const connectedRrTx = this.financialBookTransactionsToCreateMap.get(`${oldId}`);
            if (connectedRrTx) {
                connectedRrTx.addRemoteId(`${newId}`);
            }
            // FX
            const connectedMtmTx = this.financialBookTransactionsToCreateMap.get(`mtm_${oldId}`);
            if (connectedMtmTx) {
                connectedMtmTx.addRemoteId(`mtm_${newId}`);
            }
            // MTM
            const connectedFxTx = this.baseBookTransactionsToCreateMap.get(`fx_${oldId}`);
            if (connectedFxTx) {
                connectedFxTx.addRemoteId(`fx_${newId}`);
            }

        }

        // Fire other batch operations
        this.fireBatchUpdateStockBookTransactions();
        this.fireBatchCheckStockBookTransactions();
        this.fireBatchCreateFinancialBookTransactions();
        this.fireBatchCreateBaseBookTransactions();

    }

    // Stock book: create
    private fireBatchCreateStockBookTransactions(): Bkper.Transaction[] {
        const stockBookTransactionsToCreate = Array.from(this.stockBookTransactionsToCreate.values());
        if (stockBookTransactionsToCreate.length > 0) {
            return this.stockBook.batchCreateTransactions(stockBookTransactionsToCreate);
        }
        return [];
    }

    // Stock book: update
    private fireBatchUpdateStockBookTransactions(): void {
        const stockBookTransactionsToUpdate = Array.from(this.stockBookTransactionsToUpdateMap.values());
        if (stockBookTransactionsToUpdate.length > 0) {
            this.stockBook.batchUpdateTransactions(stockBookTransactionsToUpdate, true);
        }
    }

    // Stock book: check
    private fireBatchCheckStockBookTransactions(): void {
        const stockBookTransactionsToCheck = Array.from(this.stockBookTransactionsToCheckMap.values());
        if (stockBookTransactionsToCheck.length > 0) {
            this.stockBook.batchCheckTransactions(stockBookTransactionsToCheck);
        }
    }

    // Financial book: create
    private fireBatchCreateFinancialBookTransactions(): void {
        const financialBookTransactionsToCreate = Array.from(this.financialBookTransactionsToCreateMap.values());
        if (financialBookTransactionsToCreate.length > 0) {
            this.financialBook.batchCreateTransactions(financialBookTransactionsToCreate);
        }
    }

    // Base book: create
    private fireBatchCreateBaseBookTransactions(): void {
        const baseBookTransactionsToCreate = Array.from(this.baseBookTransactionsToCreateMap.values());
        if (baseBookTransactionsToCreate.length > 0) {
            this.baseBook.batchCreateTransactions(baseBookTransactionsToCreate);
        }
    }

}
