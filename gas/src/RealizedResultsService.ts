namespace RealizedResultsService {

    export function resetRealizedResults(stockBookId: string, stockAccountId: string, full: boolean): Summary {
        let stockBook = BkperApp.getBook(stockBookId);
        let stockAccount = new StockAccount(stockBook.getAccount(stockAccountId));

        revertRealizedResultsForAccount(stockBook, stockAccount, false, false, full);

        return { accountId: stockAccount.getId(), result: 'Done.' };
    }

    export function calculateRealizedResultsForAccount(stockBookId: string, stockAccountId: string, autoMtM: boolean): Summary {
        let stockBook = BkperApp.getBook(stockBookId);
        let stockAccount = new StockAccount(stockBook.getAccount(stockAccountId));

        let summary: Summary = {
            accountId: stockAccountId,
            result: {}
        };


        if (stockAccount.needsRebuild()) {
            revertRealizedResultsForAccount(stockBook, stockAccount, true, autoMtM, false);
        } else {
            let stockExcCode =  stockAccount.getExchangeCode();
            let financialBook = BotService.getFinancialBook(stockBook, stockExcCode);
            if (financialBook == null) {
                return summary; //Skip
            }

            let iterator = stockBook.getTransactions(BotService.getAccountQuery(stockAccount, false));

            let stockAccountSaleTransactions: Bkper.Transaction[] = [];
            let stockAccountPurchaseTransactions: Bkper.Transaction[] = [];

            while (iterator.hasNext()) {

                let tx = iterator.next();

                if (tx.isChecked()) {
                    //Filter only unchecked
                    continue;
                }

                if (BotService.isSale(tx)) {
                    stockAccountSaleTransactions.push(tx);
                }

                if (BotService.isPurchase(tx)) {
                    stockAccountPurchaseTransactions.push(tx);
                }
            }

            stockAccountSaleTransactions = stockAccountSaleTransactions.sort(BotService.compareToFIFO);
            stockAccountPurchaseTransactions = stockAccountPurchaseTransactions.sort(BotService.compareToFIFO);

            const baseBook = BotService.getBaseBook(financialBook);

            for (const saleTransaction of stockAccountSaleTransactions) {
                processSale(baseBook, financialBook, stockExcCode, stockBook, stockAccount, saleTransaction, stockAccountPurchaseTransactions, summary, autoMtM);
            }

            checkLastTxDate(stockAccount, stockAccountSaleTransactions, stockAccountPurchaseTransactions);

        }

        return summary;

    }

    export function revertRealizedResultsForAccount(stockBook: Bkper.Book, stockAccount: StockAccount, recalculate: boolean, autoMtM: boolean, full: boolean): Summary {
        let iterator = stockBook.getTransactions(BotService.getAccountQuery(stockAccount, full));
        let summary: Summary = {
            accountId: stockAccount.getId(),
            result: {}
        };
        let stockAccountSaleTransactions: Bkper.Transaction[] = [];
        let stockAccountPurchaseTransactions: Bkper.Transaction[] = [];

        let stockExcCode = stockAccount.getExchangeCode();
        let financialBook = BotService.getFinancialBook(stockBook, stockExcCode)
        if (financialBook == null) {
            return;
        }

        const baseBook = BotService.getBaseBook(financialBook);
        const transactions: Bkper.Transaction[] = []

        while (iterator.hasNext()) {
            let tx = iterator.next();
            transactions.push(tx)
            console.log(tx.getDescription())
        }

        for (let tx of transactions) {

            if (tx.isChecked()) {
                tx = tx.uncheck();
            }

            let i = financialBook.getTransactions(`remoteId:${tx.getId()}`)
            while (i.hasNext()) {
                let financialTx = i.next();
                if (financialTx.isChecked()) {
                    financialTx = financialTx.uncheck();
                }
                financialTx.remove();
            }
            i = financialBook.getTransactions(`remoteId:mtm_${tx.getId()}`)
            while (i.hasNext()) {
                let mtmTx = i.next();
                if (mtmTx.isChecked()) {
                    mtmTx = mtmTx.uncheck();
                }
                mtmTx.remove();
            }
            i = baseBook.getTransactions(`remoteId:fx_${tx.getId()}`)
            while (i.hasNext()) {
                let fxTx = i.next();
                if (fxTx.isChecked()) {
                    fxTx = fxTx.uncheck();
                }
                fxTx.remove();
            }

            let originalAmountProp = tx.getProperty(ORIGINAL_AMOUNT_PROP)
            let originalQuantityProp = tx.getProperty(ORIGINAL_QUANTITY_PROP)

            if (full) {
                tx.setProperty(ORDER_PROP, tx.getProperty(HIST_ORDER_PROP)).deleteProperty(HIST_ORDER_PROP)
                if (tx.getProperty(DATE_PROP)) {
                    tx.setDate(tx.getProperty(DATE_PROP)).deleteProperty(DATE_PROP)
                }
                const histQuantity = tx.getProperty(HIST_QUANTITY_PROP);
                if (histQuantity) {
                    tx.setProperty(ORIGINAL_QUANTITY_PROP, histQuantity)
                    originalQuantityProp = histQuantity
                    tx.deleteProperty(HIST_QUANTITY_PROP)
                }
            }

            if (!originalQuantityProp) {
                tx.remove();
            } else if (BotService.isSale(tx)) {
                let salePriceProp = tx.getProperty(SALE_PRICE_PROP)
                //OLD way to find price
                if (originalAmountProp && originalQuantityProp && !salePriceProp) {
                    let salePrice = BkperApp.newAmount(originalAmountProp).div(BkperApp.newAmount(originalQuantityProp))
                    tx.setProperty(SALE_PRICE_PROP, salePrice.toString())
                }
                tx.deleteProperty(GAIN_AMOUNT_PROP)
                    .deleteProperty('gain_log')
                    .deleteProperty(PURCHASE_LOG_PROP)
                    .deleteProperty(PURCHASE_AMOUNT_PROP)
                    .deleteProperty(SALE_AMOUNT_PROP)
                    .deleteProperty(SHORT_SALE_PROP)
                    .deleteProperty(PURCHASE_PRICE_PROP)
                    .deleteProperty(PURCHASE_EXC_RATE_PROP)
                    .deleteProperty(SALE_EXC_RATE_PROP)
                    .deleteProperty(EXC_RATE_PROP)
                    .setAmount(originalQuantityProp)
                    .update();
                stockAccountSaleTransactions.push(tx);

            } else if (BotService.isPurchase(tx)) {
                let purchasePriceProp = tx.getProperty(PURCHASE_PRICE_PROP)

                //OLD way to find price
                if (originalAmountProp && originalQuantityProp && !purchasePriceProp) {
                    let purchasePrice = BkperApp.newAmount(originalAmountProp).div(BkperApp.newAmount(originalQuantityProp))
                    tx.setProperty(PURCHASE_PRICE_PROP, purchasePrice.toString())
                }

                tx.deleteProperty(SALE_DATE_PROP)
                    .deleteProperty(SALE_PRICE_PROP)
                    .deleteProperty(SALE_AMOUNT_PROP)
                    .deleteProperty(SHORT_SALE_PROP)
                    .deleteProperty(GAIN_AMOUNT_PROP)
                    .deleteProperty(PURCHASE_LOG_PROP)
                    .deleteProperty('gain_log')
                    .deleteProperty(PURCHASE_AMOUNT_PROP)
                    .deleteProperty(PURCHASE_EXC_RATE_PROP)
                    .deleteProperty(SALE_EXC_RATE_PROP)
                    .deleteProperty(EXC_RATE_PROP)
                    .setAmount(originalQuantityProp)
                    .update();
                stockAccountPurchaseTransactions.push(tx);
            }
        }

        stockAccount.clearNeedsRebuild()

        if (full) {
            stockAccount.deleteRealizedDate().deleteForwardedDate();
        } else {
            let forwardedDate = stockAccount.getForwardedDate();
            if (forwardedDate) {
                stockAccount.setRealizedDate(forwardedDate);
            } else {
                stockAccount.deleteRealizedDate();
            }
        }

        stockAccount.update()

        if (recalculate) {
            //FIFO
            stockAccountSaleTransactions = stockAccountSaleTransactions.sort(BotService.compareToFIFO);
            stockAccountPurchaseTransactions = stockAccountPurchaseTransactions.sort(BotService.compareToFIFO);

            const baseBook = BotService.getBaseBook(financialBook);

            for (const saleTransaction of stockAccountSaleTransactions) {
                processSale(baseBook, financialBook, stockExcCode, stockBook, stockAccount, saleTransaction, stockAccountPurchaseTransactions, summary, autoMtM);
            }
            checkLastTxDate(stockAccount, stockAccountSaleTransactions, stockAccountPurchaseTransactions);
        }


        return summary;

    }

    function checkLastTxDate(stockAccount: StockAccount, stockAccountSaleTransactions: Bkper.Transaction[], stockAccountPurchaseTransactions: Bkper.Transaction[]) {
        let lastSaleTx = stockAccountSaleTransactions.length > 0 ? stockAccountSaleTransactions[stockAccountSaleTransactions.length - 1] : null;
        let lastPurchaseTx = stockAccountPurchaseTransactions.length > 0 ? stockAccountPurchaseTransactions[stockAccountPurchaseTransactions.length - 1] : null;

        let lastTxDateValue = lastSaleTx != null ? lastSaleTx.getDateValue() : null;
        let lastTxDate = lastSaleTx != null ? lastSaleTx.getDate() : null;
        if ((lastTxDateValue == null && lastPurchaseTx != null) || (lastPurchaseTx != null && lastPurchaseTx.getDateValue() > +lastTxDateValue)) {
            lastTxDate = lastPurchaseTx.getDate();
            lastTxDateValue = lastPurchaseTx.getDateValue();
        }
        let stockAccountLastTxDateValue = stockAccount.getRealizedDateValue();
        if (lastTxDateValue != null && (stockAccountLastTxDateValue == null || lastTxDateValue > stockAccountLastTxDateValue)) {
            stockAccount.setRealizedDate(lastTxDate).update();
        }
    }



    function logPurchase(stockBook: Bkper.Book, quantity: Bkper.Amount, price: Bkper.Amount, date: string, excRate: Bkper.Amount): PurchaseLogEntry {
        return {
            qt: quantity.toFixed(stockBook.getFractionDigits()).toString(),
            pr: price.toString(),
            dt: date,
            rt: excRate?.toString()
        }
    }

    function isShortSale(purchaseTransaction: Bkper.Transaction, saleTransaction: Bkper.Transaction): boolean {
        return BotService.compareToFIFO(saleTransaction, purchaseTransaction) < 0;
    }

    function processSale(baseBook: Bkper.Book, financialBook: Bkper.Book, stockExcCode: string, stockBook: Bkper.Book, stockAccount: StockAccount, saleTransaction: Bkper.Transaction, purchaseTransactions: Bkper.Transaction[], summary: Summary, autoMtM: boolean): void {

        let salePrice: Bkper.Amount = BkperApp.newAmount(saleTransaction.getProperty(SALE_PRICE_PROP, PRICE_PROP));

        let soldQuantity = saleTransaction.getAmount();
        const saleExcRate = BotService.getExcRate(baseBook, financialBook, saleTransaction, SALE_EXC_RATE_PROP)

        let purchaseTotal = BkperApp.newAmount(0);
        let saleTotal = BkperApp.newAmount(0);
        let gainTotal = BkperApp.newAmount(0);
        let gainBaseNoFxTotal = BkperApp.newAmount(0);
        let gainBaseWithFxTotal = BkperApp.newAmount(0);

        let unrealizedAccount = getUnrealizedAccount(stockAccount, financialBook, summary, stockExcCode);
        let unrealizedBaseAccount = getUnrealizedAccount(stockAccount, baseBook, summary, stockExcCode);

        let purchaseLogEntries: PurchaseLogEntry[] = []



        for (const purchaseTransaction of purchaseTransactions) {

            if (purchaseTransaction.isChecked()) {
                //Only process unchecked ones
                continue;
            }

            let shortSale = isShortSale(purchaseTransaction, saleTransaction);

            const purchaseExcRate = BotService.getExcRate(baseBook, financialBook, purchaseTransaction, PURCHASE_EXC_RATE_PROP)

            let purchasePrice: Bkper.Amount = BkperApp.newAmount(purchaseTransaction.getProperty(PURCHASE_PRICE_PROP, PRICE_PROP));
            let purchaseQuantity = purchaseTransaction.getAmount();

            if (soldQuantity.gte(purchaseQuantity)) {
                const saleAmount = (salePrice.times(purchaseQuantity));
                const purchaseAmount = (purchasePrice.times(purchaseQuantity));
                let gain = saleAmount.minus(purchaseAmount);
                let gainBaseNoFX = BotService.calculateGainBaseNoFX(gain, purchaseExcRate, saleExcRate, shortSale);
                let gainBaseWithFX = BotService.calculateGainBaseWithFX(purchaseAmount, purchaseExcRate, saleAmount, saleExcRate);
                if (!shortSale) {
                    purchaseTotal = purchaseTotal.plus(purchaseAmount);
                    saleTotal = saleTotal.plus(saleAmount);
                    gainTotal = gainTotal.plus(gain);
                    gainBaseNoFxTotal = gainBaseNoFxTotal.plus(gainBaseNoFX);
                    gainBaseWithFxTotal = gainBaseWithFxTotal.plus(gainBaseWithFX);
                    purchaseLogEntries.push(logPurchase(stockBook, purchaseQuantity, purchasePrice, purchaseTransaction.getDate(), purchaseExcRate))
                }
                purchaseTransaction
                    .setProperty(PURCHASE_PRICE_PROP, purchasePrice.toString())
                    .setProperty(PURCHASE_AMOUNT_PROP, purchaseAmount.toString())
                    .setProperty(PURCHASE_EXC_RATE_PROP, purchaseExcRate?.toString())

                if (shortSale) {
                    purchaseTransaction.setProperty(SALE_PRICE_PROP, salePrice.toString())
                        .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                        .setProperty(SALE_AMOUNT_PROP, saleAmount.toString())
                        .setProperty(SALE_DATE_PROP, saleTransaction.getDate())
                        .setProperty(GAIN_AMOUNT_PROP, gain.toString())
                        .setProperty(SHORT_SALE_PROP, 'true')
                }
                purchaseTransaction.update();

                if (shortSale) {
                    recordRealizedResult(baseBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, purchaseTransaction, gain, purchaseTransaction.getDate(), gainBaseNoFX, summary);
                    recordFxGain(stockExcCode, baseBook, unrealizedBaseAccount, purchaseTransaction, gainBaseWithFX, gainBaseNoFX, purchaseTransaction.getDate(), summary)
                    if (autoMtM) {
                        markToMarket(stockBook, purchaseTransaction, stockAccount, financialBook, unrealizedAccount, purchaseTransaction.getDateObject(), purchasePrice, gain)
                    }
                }

                purchaseTransaction.check();

                soldQuantity = soldQuantity.minus(purchaseQuantity);

            } else {

                let remainingBuyQuantity = purchaseQuantity.minus(soldQuantity);

                let partialBuyQuantity = purchaseQuantity.minus(remainingBuyQuantity);

                const saleAmount = salePrice.times(partialBuyQuantity);
                const purchaseAmount = purchasePrice.times(partialBuyQuantity);
                let gain = saleAmount.minus(purchaseAmount);
                let gainBaseNoFX = BotService.calculateGainBaseNoFX(gain, purchaseExcRate, saleExcRate, shortSale);
                let gainBaseWithFX = BotService.calculateGainBaseWithFX(purchaseAmount, purchaseExcRate, saleAmount, saleExcRate);

                purchaseTransaction
                    .setAmount(remainingBuyQuantity)
                    .update();

                let splittedPurchaseTransaction = stockBook.newTransaction()
                    .setDate(purchaseTransaction.getDate())
                    .setAmount(partialBuyQuantity)
                    .setCreditAccount(purchaseTransaction.getCreditAccount())
                    .setDebitAccount(purchaseTransaction.getDebitAccount())
                    .setDescription(purchaseTransaction.getDescription())
                    .setProperty(ORDER_PROP, purchaseTransaction.getProperty(ORDER_PROP))
                    .setProperty(PARENT_ID, purchaseTransaction.getId())
                    .setProperty(PURCHASE_PRICE_PROP, purchasePrice.toString())
                    .setProperty(PURCHASE_AMOUNT_PROP, purchaseAmount.toString())
                    .setProperty(PURCHASE_EXC_RATE_PROP, purchaseExcRate?.toString())

                if (shortSale) {
                    splittedPurchaseTransaction
                        .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                        .setProperty(SALE_PRICE_PROP, salePrice.toString())
                        .setProperty(SALE_AMOUNT_PROP, saleAmount.toString())
                        .setProperty(SALE_DATE_PROP, saleTransaction.getDate())
                        .setProperty(GAIN_AMOUNT_PROP, gain.toString())
                        .setProperty(SHORT_SALE_PROP, 'true')
                }

                splittedPurchaseTransaction.post().check()

                if (shortSale) {
                    recordRealizedResult(baseBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, splittedPurchaseTransaction, gain, splittedPurchaseTransaction.getDate(), gainBaseNoFX, summary);
                    recordFxGain(stockExcCode, baseBook, unrealizedBaseAccount, splittedPurchaseTransaction, gainBaseWithFX, gainBaseNoFX, splittedPurchaseTransaction.getDate(), summary)
                    if (autoMtM) {
                        markToMarket(stockBook, splittedPurchaseTransaction, stockAccount, financialBook, unrealizedAccount, splittedPurchaseTransaction.getDateObject(), purchasePrice, gain)
                    }
                }

                soldQuantity = soldQuantity.minus(partialBuyQuantity);

                if (!shortSale) {
                    purchaseTotal = purchaseTotal.plus(purchaseAmount);
                    saleTotal = saleTotal.plus(saleAmount);
                    gainTotal = gainTotal.plus(gain);
                    gainBaseNoFxTotal = gainBaseNoFxTotal.plus(gainBaseNoFX);
                    gainBaseWithFxTotal = gainBaseWithFxTotal.plus(gainBaseWithFX);
                    purchaseLogEntries.push(logPurchase(stockBook, partialBuyQuantity, purchasePrice, purchaseTransaction.getDate(), purchaseExcRate))
                }

            }

            if (soldQuantity.lte(0)) {
                break;
            }

        }


        if (soldQuantity.round(stockBook.getFractionDigits()).eq(0)) {
            if (purchaseLogEntries.length > 0) {
                saleTransaction
                    .setProperty(PURCHASE_AMOUNT_PROP, purchaseTotal.toString())
                    .setProperty(SALE_AMOUNT_PROP, saleTotal.toString())
                    .setProperty(GAIN_AMOUNT_PROP, gainTotal.toString())
                    .setProperty(PURCHASE_LOG_PROP, JSON.stringify(purchaseLogEntries))
                    .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                saleTransaction.update()
            }
            saleTransaction.check();
        } else if (soldQuantity.round(stockBook.getFractionDigits()).gt(0)) {

            let remainingSaleQuantity = saleTransaction.getAmount().minus(soldQuantity);

            if (!remainingSaleQuantity.eq(0)) {



                saleTransaction
                    .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                    .setAmount(soldQuantity)
                    .update();

                let splittedSaleTransaction = stockBook.newTransaction()
                    .setDate(saleTransaction.getDate())
                    .setAmount(remainingSaleQuantity)
                    .setCreditAccount(saleTransaction.getCreditAccount())
                    .setDebitAccount(saleTransaction.getDebitAccount())
                    .setDescription(saleTransaction.getDescription())
                    .setProperty(ORDER_PROP, saleTransaction.getProperty(ORDER_PROP))
                    .setProperty(PARENT_ID, saleTransaction.getId())
                    .setProperty(SALE_PRICE_PROP, salePrice.toString())
                    .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())

                if (purchaseLogEntries.length > 0) {
                    splittedSaleTransaction
                        .setProperty(PURCHASE_AMOUNT_PROP, purchaseTotal.toString())
                        .setProperty(SALE_AMOUNT_PROP, saleTotal.toString())
                        .setProperty(GAIN_AMOUNT_PROP, gainTotal.toString())
                        .setProperty(PURCHASE_LOG_PROP, JSON.stringify(purchaseLogEntries))
                }

                splittedSaleTransaction.post().check()
            }

        }

        recordRealizedResult(baseBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, saleTransaction, gainTotal, saleTransaction.getDate(), gainBaseNoFxTotal, summary);
        recordFxGain(stockExcCode, baseBook, unrealizedBaseAccount, saleTransaction, gainBaseWithFxTotal, gainBaseNoFxTotal, saleTransaction.getDate(), summary)
        if (autoMtM) {
            markToMarket(stockBook, saleTransaction, stockAccount, financialBook, unrealizedAccount, saleTransaction.getDateObject(), salePrice, gainTotal)
        }

    }


    function getUnrealizedAccount(stockAccount: StockAccount, book: Bkper.Book, summary: Summary, stockExcCode: string) {
        let unrealizedAccountName = `${stockAccount.getName()} ${UREALIZED_SUFFIX}`;
        let unrealizedAccount = book.getAccount(unrealizedAccountName);
        if (unrealizedAccount == null) {
            unrealizedAccount = book.newAccount()
                .setName(unrealizedAccountName)
                .setType(BkperApp.AccountType.LIABILITY);
            let groups = getAccountGroups(book, UREALIZED_SUFFIX);
            groups.forEach(group => unrealizedAccount.addGroup(group));
            unrealizedAccount.create();
            trackAccountCreated(summary, stockExcCode, unrealizedAccount);
        }
        return unrealizedAccount;
    }

    function recordRealizedResult(
        baseBook: Bkper.Book,
        stockAccount: StockAccount,
        stockExcCode: string,
        financialBook: Bkper.Book,
        unrealizedAccount: Bkper.Account,
        transaction: Bkper.Transaction,
        gain: Bkper.Amount,
        gainDate: string,
        gainBaseNoFX: Bkper.Amount,
        summary: Summary
    ) {

        let isBaseBook = baseBook.getId() == financialBook.getId();

        if (gain.round(financialBook.getFractionDigits()).gt(0)) {

            let realizedGainAccountName = `${stockAccount.getName()} ${REALIZED_SUFFIX}`;
            let realizedGainAccount = financialBook.getAccount(realizedGainAccountName);

            if (realizedGainAccount == null) {
                //Fallback to old XXX Gain default
                realizedGainAccount = financialBook.getAccount(`${stockAccount.getName()} Realized Gain`);
            }


            if (realizedGainAccount == null) {
                realizedGainAccount = financialBook.newAccount()
                    .setName(realizedGainAccountName)
                    .setType(BkperApp.AccountType.INCOMING);
                let groups = getAccountGroups(financialBook, REALIZED_SUFFIX);
                groups.forEach(group => realizedGainAccount.addGroup(group));
                realizedGainAccount.create();
                trackAccountCreated(summary, stockExcCode, realizedGainAccount);
            }

            financialBook.newTransaction()
                .addRemoteId(transaction.getId())
                .setDate(gainDate)
                .setAmount(gain)
                .setDescription(`#stock_gain`)
                .setProperty(EXC_AMOUNT_PROP, isBaseBook ? null : gainBaseNoFX.abs().toString())
                .setProperty(EXC_CODE_PROP, isBaseBook ? null : BotService.getExcCode(baseBook))
                .from(realizedGainAccount)
                .to(unrealizedAccount)
                .post().check();

        } else if (gain.round(financialBook.getFractionDigits()).lt(0)) {

            let realizedLossAccountName = `${stockAccount.getName()} ${REALIZED_SUFFIX}`;
            let realizedLossAccount = financialBook.getAccount(realizedLossAccountName);

            if (realizedLossAccount == null) {
                //Fallback to old XXX Loss account
                realizedLossAccount = financialBook.getAccount(`${stockAccount.getName()} Realized Loss`);
            }
            if (realizedLossAccount == null) {
                realizedLossAccount = financialBook.newAccount()
                    .setName(realizedLossAccountName)
                    .setType(BkperApp.AccountType.OUTGOING);
                let groups = getAccountGroups(financialBook, REALIZED_SUFFIX);
                groups.forEach(group => realizedLossAccount.addGroup(group));
                realizedLossAccount.create();
                trackAccountCreated(summary, stockExcCode, realizedLossAccount);
            }

            financialBook.newTransaction()
                .addRemoteId(transaction.getId())
                .setDate(gainDate)
                .setAmount(gain)
                .setDescription(`#stock_loss`)
                .setProperty(EXC_AMOUNT_PROP, isBaseBook ? null : gainBaseNoFX.abs().toString())
                .setProperty(EXC_CODE_PROP, isBaseBook ? null : BotService.getExcCode(baseBook))
                .from(unrealizedAccount)
                .to(realizedLossAccount)
                .post().check();

        }
    }

    function trackAccountCreated(summary: Summary, stockExcCode: string, account: Bkper.Account) {
        if (summary.result[stockExcCode] == null) {
            summary.result[stockExcCode] = [];
        }
        summary.result[stockExcCode].push(account.getName());
    }

    function markToMarket(
        stockBook: Bkper.Book,
        transaction: Bkper.Transaction,
        stockAccount: StockAccount,
        financialBook: Bkper.Book,
        unrealizedAccount: Bkper.Account,
        date: Date,
        price: Bkper.Amount,
        gain: Bkper.Amount
    ): void {

        if (gain.round(financialBook.getFractionDigits()).eq(0)) {
            return;
        }

        let total_quantity = getAccountBalance(stockBook, stockAccount, date);
        let financialInstrument = financialBook.getAccount(stockAccount.getName());
        let balance = getAccountBalance(financialBook, financialInstrument, date);
        let newBalance = total_quantity.times(price);

        let amount = newBalance.minus(balance);


        if (amount.round(financialBook.getFractionDigits()).gt(0)) {

            financialBook.newTransaction()
                .setDate(date)
                .setAmount(amount)
                .setDescription(`#mtm`)
                .setProperty(PRICE_PROP, financialBook.formatAmount(price))
                .setProperty(OPEN_QUANTITY_PROP, total_quantity.toFixed(stockBook.getFractionDigits()))
                .from(unrealizedAccount)
                .to(financialInstrument)
                .addRemoteId(`mtm_${transaction.getId()}`)
                .post().check();

        } else if (amount.round(financialBook.getFractionDigits()).lt(0)) {
            financialBook.newTransaction()
                .setDate(date)
                .setAmount(amount)
                .setDescription(`#mtm`)
                .setProperty(PRICE_PROP, financialBook.formatAmount(price))
                .setProperty(OPEN_QUANTITY_PROP, total_quantity.toFixed(stockBook.getFractionDigits()))
                .from(financialInstrument)
                .to(unrealizedAccount)
                .addRemoteId(`mtm_${transaction.getId()}`)
                .post().check();
        }
    }

    function getAccountBalance(book: Bkper.Book, account: Bkper.Account | StockAccount, date: Date): Bkper.Amount {
        let balances = book.getBalancesReport(`account:"${account.getName()}" on:${book.formatDate(date)}`);
        let containers = balances.getBalancesContainers();
        if (containers == null || containers.length == 0) {
            return BkperApp.newAmount(0);
        }
        return containers[0].getCumulativeBalance();
    }



    function getAccountGroups(book: Bkper.Book, gainLossSuffix: string): Set<Bkper.Group> {
        let accountNames = new Set<string>();

        book.getAccounts().forEach(account => {
            if (account.getName().endsWith(` ${gainLossSuffix}`)) {
                accountNames.add(account.getName());
            }
        });

        let groups = new Set<Bkper.Group>();

        accountNames.forEach(accountName => {
            let account = book.getAccount(accountName);
            if (account && account.getGroups()) {
                account.getGroups().forEach(group => { groups.add(group) })
            }
        })

        return groups;
    }


    function recordFxGain(
        stockExcCode: string,
        baseBook: Bkper.Book,
        unrealizedAccount: Bkper.Account,
        transaction: Bkper.Transaction,
        gainBaseWithFx: Bkper.Amount,
        gainBaseNoFx: Bkper.Amount,
        gainDate: string,
        summary: Summary
    ): void {

        if (!gainBaseWithFx) {
            console.log('Missing gain with FX')
            return;
        }

        if (!gainBaseNoFx) {
            console.log('Missing gain no FX')
            return;
        }

        let excAccountName = getExcAccountName(unrealizedAccount, stockExcCode);

        //Verify Exchange account created
        let excAccount = baseBook.getAccount(excAccountName);
        if (excAccount == null) {
            excAccount = baseBook.newAccount()
                .setName(excAccountName);
            let groups = getExcAccountGroups(baseBook);
            groups.forEach(group => excAccount.addGroup(group));
            let type = getExcAccountType(baseBook);
            excAccount.setType(type);
            excAccount.create();
            trackAccountCreated(summary, stockExcCode, excAccount);
        }

        const fxGain = gainBaseWithFx.minus(gainBaseNoFx);

        if (fxGain.round(baseBook.getFractionDigits()).gt(0)) {

            baseBook.newTransaction()
                .addRemoteId(`fx_` + transaction.getId())
                .setDate(gainDate)
                .setAmount(fxGain)
                .setDescription(`#exchange_gain`)
                .setProperty(EXC_AMOUNT_PROP, '0')
                .from(excAccount)
                .to(unrealizedAccount)
                .post().check();

        } else if (fxGain.round(baseBook.getFractionDigits()).lt(0)) {

            baseBook.newTransaction()
                .addRemoteId(`fx_` + transaction.getId())
                .setDate(gainDate)
                .setAmount(fxGain)
                .setDescription(`#exchange_loss`)
                .setProperty(EXC_AMOUNT_PROP, '0')
                .from(unrealizedAccount)
                .to(excAccount)
                .post().check();

        }

    }


    function getExcAccountName(connectedAccount: Bkper.Account, connectedCode: string): string {
        let groups = connectedAccount.getGroups();
        if (groups) {
            for (const group of groups) {
                let excAccount = group.getProperty(EXC_ACCOUNT_PROP)
                if (excAccount) {
                    return excAccount;
                }
            }
        }
        return `Exchange_${connectedCode}`;
    }

    export function getExcAccountGroups(book: Bkper.Book): Set<Bkper.Group> {
        let accountNames = new Set<string>();

        book.getAccounts().forEach(account => {
            let accountName = account.getProperty(EXC_ACCOUNT_PROP);
            if (accountName) {
                accountNames.add(accountName);
            }
            if (account.getName().startsWith('Exchange_')) {
                accountNames.add(account.getName());
            }
        });

        let groups = new Set<Bkper.Group>();

        accountNames.forEach(accountName => {
            let account = book.getAccount(accountName);
            if (account && account.getGroups()) {
                account.getGroups().forEach(group => { groups.add(group) })
            }
        })

        return groups;
    }

    export function getExcAccountType(book: Bkper.Book): Bkper.AccountType {
        let accountNames = new Set<string>();

        book.getAccounts().forEach(account => {
            let accountName = account.getProperty(EXC_ACCOUNT_PROP);
            if (accountName) {
                console.log(`Adding: ${accountName}`)
                accountNames.add(accountName);
            }
            if (account.getName().startsWith('Exchange_')) {
                console.log(`Adding: ${account.getName()}`)
                accountNames.add(account.getName());
            }
        });

        for (const accountName of accountNames) {
            let account = book.getAccount(accountName);
            if (account) {
                return account.getType();
            }
        }

        return BkperApp.AccountType.LIABILITY;
    }


}
