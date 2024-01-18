namespace RealizedResultsService {

    export function calculateRealizedResultsForAccount(stockBookId: string, stockAccountId: string, autoMtM: boolean, toDate: string): Summary {

        let stockBook = BkperApp.getBook(stockBookId);
        if (!toDate) {
            toDate = stockBook.formatDate(new Date());
        }

        let stockAccount = new StockAccount(stockBook.getAccount(stockAccountId));

        let historical = stockBook.getProperty(STOCK_HISTORICAL_PROP) && stockBook.getProperty(STOCK_HISTORICAL_PROP).toLowerCase() == 'true' ? true : false;

        let summary: Summary = {
            accountId: stockAccountId,
            result: {}
        };

        if (stockAccount.needsRebuild()) {
            resetRealizedResultsForAccount(stockBook, stockAccount, false);
            stockBook = BkperApp.getBook(stockBookId);
            stockAccount = new StockAccount(stockBook.getAccount(stockAccountId));
        }

        let stockExcCode = stockAccount.getExchangeCode();
        let financialBook = BotService.getFinancialBook(stockBook, stockExcCode);
        if (financialBook == null) {
            return summary; //Skip
        }

        const beforeDate = BotService.getBeforeDateIsoString(stockBook, toDate);
        let iterator = stockBook.getTransactions(BotService.getAccountQuery(stockAccount, false, beforeDate));

        let stockAccountSaleTransactions: Bkper.Transaction[] = [];
        let stockAccountPurchaseTransactions: Bkper.Transaction[] = [];

        while (iterator.hasNext()) {
            const tx = iterator.next();
            // Filter only unchecked
            if (tx.isChecked()) {
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
            if (stockAccountPurchaseTransactions.length > 0) {
                processSale(baseBook, financialBook, stockExcCode, stockBook, stockAccount, saleTransaction, stockAccountPurchaseTransactions, summary, autoMtM, historical);
            }
        }

        // Check & record exchange rates if missing
        checkAndRecordExchangeRates(baseBook, financialBook, stockAccountSaleTransactions, stockAccountPurchaseTransactions);

        // Check & record Interest account MTM if necessary
        if (autoMtM) {
            const financialInterestAccount = BotService.getInterestAccount(financialBook, stockAccount.getName());
            const lastTransactionId = getLastTransactionId(stockAccountSaleTransactions, stockAccountPurchaseTransactions);
            if (financialInterestAccount && lastTransactionId) {
                checkAndRecordInterestMtm(stockAccount, stockBook, financialInterestAccount, financialBook, toDate, lastTransactionId, summary);
            }
        }

        checkLastTxDate(stockAccount, stockAccountSaleTransactions, stockAccountPurchaseTransactions);

        return summary;

    }

    function checkAndRecordExchangeRates(baseBook: Bkper.Book, financialBook: Bkper.Book, saleTransactions: Bkper.Transaction[], purchaseTransactions: Bkper.Transaction[]): void {
        for (const saleTx of saleTransactions) {
            if (!saleTx.isChecked()) {
                recordExcRateProp(baseBook, financialBook, saleTx, SALE_EXC_RATE_PROP);
            }
        }
        for (const purchaseTx of purchaseTransactions) {
            if (!purchaseTx.isChecked()) {
                recordExcRateProp(baseBook, financialBook, purchaseTx, PURCHASE_EXC_RATE_PROP);
            }
        }
    }

    function recordExcRateProp(baseBook: Bkper.Book, financialBook: Bkper.Book, transaction: Bkper.Transaction, exchangeRateProperty: string): void {
        if (transaction.isChecked()) {
            return;
        }
        const excRateProp = transaction.getProperty(exchangeRateProperty);
        if (!excRateProp) {
            const excRate = BotService.getExcRate(baseBook, financialBook, transaction, exchangeRateProperty);
            transaction.setProperty(exchangeRateProperty, excRate?.toString());
        }
        const fwdExcRateProp = transaction.getProperty(`fwd_${exchangeRateProperty}`);
        if (!fwdExcRateProp) {
            const excRate = BotService.getExcRate(baseBook, financialBook, transaction, exchangeRateProperty);
            const fwdExcRate = BotService.getFwdExcRate(transaction, `fwd_${exchangeRateProperty}`, excRate);
            transaction.setProperty(`fwd_${exchangeRateProperty}`, fwdExcRate?.toString());
        }
        // Update transaction if necessary
        if (!excRateProp || !fwdExcRateProp) {
            transaction.update();
        }
    }

    function checkAndRecordInterestMtm(principalStockAccount: StockAccount, stockBook: Bkper.Book, financialInterestAccount: Bkper.Account, financialBook: Bkper.Book, onDateIso: string, lastTransactionId: string, summary: Summary): void {
        // Check principal account quantity on Stock Book
        const principalQuantity = getAccountBalance(stockBook, principalStockAccount, stockBook.parseDate(onDateIso));
        if (principalQuantity.eq(0)) {
            // Check interest account balance on Financial Book
            const interestBalance = getAccountBalance(financialBook, financialInterestAccount, financialBook.parseDate(onDateIso));
            if (!interestBalance.eq(0)) {
                // Record interest account MTM on financial book
                const financialUnrealizedAccount = getUnrealizedAccount(financialInterestAccount, financialBook, summary, principalStockAccount.getExchangeCode());
                recordInterestAccountMtm(financialBook, financialInterestAccount, financialUnrealizedAccount, interestBalance, onDateIso, lastTransactionId);
            }
        }
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

    function logLiquidation(transaction: Bkper.Transaction, price: Bkper.Amount, excRate: Bkper.Amount): LiquidationLogEntry {
        return {
            id: transaction.getId(),
            dt: transaction.getDate(),
            qt: transaction.getAmount().toString(),
            pr: price.toString(),
            rt: excRate?.toString()
        }
    }

    function logPurchase(stockBook: Bkper.Book, quantity: Bkper.Amount, price: Bkper.Amount, transaction: Bkper.Transaction, excRate: Bkper.Amount): PurchaseLogEntry {
        return {
            qt: quantity.toString(),
            pr: price.toString(),
            dt: transaction.getProperty(DATE_PROP) || transaction.getDate(),
            rt: excRate?.toString()
        }
    }

    function isShortSale(purchaseTransaction: Bkper.Transaction, saleTransaction: Bkper.Transaction): boolean {
        return BotService.compareToFIFO(saleTransaction, purchaseTransaction) < 0;
    }

    function processSale(baseBook: Bkper.Book, financialBook: Bkper.Book, stockExcCode: string, stockBook: Bkper.Book, stockAccount: StockAccount, saleTransaction: Bkper.Transaction, purchaseTransactions: Bkper.Transaction[], summary: Summary, autoMtM: boolean, historical: boolean): void {

        // Log operation status
        console.log(`processing sale: ${saleTransaction.getId()}`);

        let salePrice: Bkper.Amount = BkperApp.newAmount(saleTransaction.getProperty(SALE_PRICE_PROP, PRICE_PROP));
        let fwdSalePrice: Bkper.Amount = saleTransaction.getProperty(FWD_SALE_PRICE_PROP) ? BkperApp.newAmount(saleTransaction.getProperty(FWD_SALE_PRICE_PROP)) : salePrice;

        let soldQuantity = saleTransaction.getAmount();
        const saleExcRate = BotService.getExcRate(baseBook, financialBook, saleTransaction, SALE_EXC_RATE_PROP)
        const fwdSaleExcRate = BotService.getFwdExcRate(saleTransaction, FWD_SALE_EXC_RATE_PROP, saleExcRate)

        let purchaseTotal = BkperApp.newAmount(0);
        let saleTotal = BkperApp.newAmount(0);

        let gainTotal = BkperApp.newAmount(0);
        let gainBaseNoFxTotal = BkperApp.newAmount(0);
        let gainBaseWithFxTotal = BkperApp.newAmount(0);

        let fwdPurchaseTotal = BkperApp.newAmount(0);
        let fwdSaleTotal = BkperApp.newAmount(0);

        let unrealizedAccount = getUnrealizedAccount(stockAccount, financialBook, summary, stockExcCode);

        const excAggregateProp = baseBook.getProperty(EXC_AGGREGATE_PROP);
        let unrealizedFxBaseAccount = excAggregateProp ? getUnrealizedAccount(stockAccount, baseBook, summary, stockExcCode) : getUnrealizedFxAccount(stockAccount, baseBook, summary, stockExcCode);

        let purchaseLogEntries: PurchaseLogEntry[] = []
        let fwdPurchaseLogEntries: PurchaseLogEntry[] = []

        let shortSaleLiquidationLogEntries: LiquidationLogEntry[] = [];

        // Control liquidation status
        let purchaseProcessed = false;

        for (const purchaseTransaction of purchaseTransactions) {

            // Log operation status
            console.log(`processing purchase: ${purchaseTransaction.getId()}`);

            let longSaleLiquidationLogEntries: LiquidationLogEntry[] = [];

            if (purchaseTransaction.isChecked()) {
                // Only process unchecked purchases
                continue;
            }

            // Processing purchase
            purchaseProcessed = true;

            let shortSale = isShortSale(purchaseTransaction, saleTransaction);

            const purchaseExcRate = BotService.getExcRate(baseBook, financialBook, purchaseTransaction, PURCHASE_EXC_RATE_PROP)
            const fwdPurchaseExcRate = BotService.getFwdExcRate(purchaseTransaction, FWD_PURCHASE_EXC_RATE_PROP, purchaseExcRate)
            let purchasePrice: Bkper.Amount = BkperApp.newAmount(purchaseTransaction.getProperty(PURCHASE_PRICE_PROP, PRICE_PROP));
            let fwdPurchasePrice: Bkper.Amount = purchaseTransaction.getProperty(FWD_PURCHASE_PRICE_PROP) ? BkperApp.newAmount(purchaseTransaction.getProperty(FWD_PURCHASE_PRICE_PROP)) : purchasePrice;
            let purchaseQuantity = purchaseTransaction.getAmount();

            if (soldQuantity.gte(purchaseQuantity)) {
                const saleAmount = salePrice.times(purchaseQuantity);
                const purchaseAmount = purchasePrice.times(purchaseQuantity);
                const fwdSaleAmount = fwdSalePrice.times(purchaseQuantity);
                const fwdPurchaseAmount = fwdPurchasePrice.times(purchaseQuantity);

                let gain = saleAmount.minus(purchaseAmount);
                let gainBaseNoFX = BotService.calculateGainBaseNoFX(gain, purchaseExcRate, saleExcRate, shortSale);
                let gainBaseWithFX = BotService.calculateGainBaseWithFX(purchaseAmount, purchaseExcRate, saleAmount, saleExcRate);

                if (!historical) {
                    //Override if not historical
                    gain = fwdSaleAmount.minus(fwdPurchaseAmount);
                    gainBaseNoFX = BotService.calculateGainBaseNoFX(gain, fwdPurchaseExcRate, fwdSaleExcRate, shortSale);
                    gainBaseWithFX = BotService.calculateGainBaseWithFX(fwdPurchaseAmount, fwdPurchaseExcRate, fwdSaleAmount, fwdSaleExcRate);
                }

                if (!shortSale) {
                    purchaseTotal = purchaseTotal.plus(purchaseAmount);
                    saleTotal = saleTotal.plus(saleAmount);
                    fwdPurchaseTotal = fwdPurchaseTotal.plus(fwdPurchaseAmount);
                    fwdSaleTotal = fwdSaleTotal.plus(fwdSaleAmount)
                    gainTotal = gainTotal.plus(gain);
                    gainBaseNoFxTotal = gainBaseNoFxTotal.plus(gainBaseNoFX);
                    gainBaseWithFxTotal = gainBaseWithFxTotal.plus(gainBaseWithFX);
                    purchaseLogEntries.push(logPurchase(stockBook, purchaseQuantity, purchasePrice, purchaseTransaction, purchaseExcRate))
                    if (fwdPurchasePrice) {
                        fwdPurchaseLogEntries.push(logPurchase(stockBook, purchaseQuantity, fwdPurchasePrice, purchaseTransaction, fwdPurchaseExcRate))
                    } else {
                        fwdPurchaseLogEntries.push(logPurchase(stockBook, purchaseQuantity, purchasePrice, purchaseTransaction, purchaseExcRate))
                    }
                }
                purchaseTransaction
                    .setProperty(PURCHASE_PRICE_PROP, purchasePrice.toString())
                    .setProperty(PURCHASE_AMOUNT_PROP, purchaseAmount.toString())
                    .setProperty(PURCHASE_EXC_RATE_PROP, purchaseExcRate?.toString())
                    .setProperty(FWD_PURCHASE_AMOUNT_PROP, fwdPurchaseAmount?.toString())

                if (shortSale) {
                    shortSaleLiquidationLogEntries.push(logLiquidation(purchaseTransaction, purchasePrice, purchaseExcRate));
                    purchaseTransaction
                        .setProperty(SALE_PRICE_PROP, salePrice.toString())
                        .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                        .setProperty(SALE_AMOUNT_PROP, saleAmount.toString())
                        .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
                        .setProperty(FWD_SALE_PRICE_PROP, fwdSalePrice?.toString())
                        .setProperty(FWD_SALE_AMOUNT_PROP, fwdSaleAmount?.toString())
                        .setProperty(SALE_DATE_PROP, saleTransaction.getProperty(DATE_PROP) || saleTransaction.getDate())
                        .setProperty(GAIN_AMOUNT_PROP, gain.toString())
                        .setProperty(SHORT_SALE_PROP, 'true')
                } else {
                    longSaleLiquidationLogEntries.push(logLiquidation(saleTransaction, salePrice, saleExcRate));
                    purchaseTransaction.setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(longSaleLiquidationLogEntries));
                }
                purchaseTransaction.update();

                if (shortSale) {
                    recordRealizedResult(baseBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, purchaseTransaction, gain, gainBaseNoFX, summary);
                    recordFxGain(stockExcCode, baseBook, unrealizedFxBaseAccount, purchaseTransaction, gainBaseWithFX, gainBaseNoFX, summary)
                    if (autoMtM) {
                        markToMarket(stockBook, purchaseTransaction, stockAccount, financialBook, unrealizedAccount, purchasePrice, gain)
                    }
                }

                purchaseTransaction.check();

                soldQuantity = soldQuantity.minus(purchaseQuantity);

            } else {

                let remainingBuyQuantity = purchaseQuantity.minus(soldQuantity);

                let partialBuyQuantity = purchaseQuantity.minus(remainingBuyQuantity);

                const saleAmount = salePrice.times(partialBuyQuantity);
                const purchaseAmount = purchasePrice.times(partialBuyQuantity);
                const fwdSaleAmount = fwdSalePrice.times(partialBuyQuantity);
                const fwdPurchaseAmount = fwdPurchasePrice.times(partialBuyQuantity);

                let gain = saleAmount.minus(purchaseAmount);
                let gainBaseNoFX = BotService.calculateGainBaseNoFX(gain, purchaseExcRate, saleExcRate, shortSale);
                let gainBaseWithFX = BotService.calculateGainBaseWithFX(purchaseAmount, purchaseExcRate, saleAmount, saleExcRate);

                if (!historical) {
                    //Override if not historical
                    gain = fwdSaleAmount.minus(fwdPurchaseAmount);
                    gainBaseNoFX = BotService.calculateGainBaseNoFX(gain, fwdPurchaseExcRate, fwdSaleExcRate, shortSale);
                    gainBaseWithFX = BotService.calculateGainBaseWithFX(fwdPurchaseAmount, fwdPurchaseExcRate, fwdSaleAmount, fwdSaleExcRate);
                }

                purchaseTransaction
                    .setAmount(remainingBuyQuantity)
                    .setProperty(PURCHASE_EXC_RATE_PROP, purchaseExcRate?.toString())
                    .setProperty(FWD_PURCHASE_EXC_RATE_PROP, fwdPurchaseExcRate?.toString())
                    .update();

                let splittedPurchaseTransaction = stockBook.newTransaction()
                    .setDate(purchaseTransaction.getDate())
                    .setAmount(partialBuyQuantity)
                    .setCreditAccount(purchaseTransaction.getCreditAccount())
                    .setDebitAccount(purchaseTransaction.getDebitAccount())
                    .setDescription(purchaseTransaction.getDescription())
                    .setProperty(ORDER_PROP, purchaseTransaction.getProperty(ORDER_PROP))
                    .setProperty(DATE_PROP, purchaseTransaction.getProperty(DATE_PROP))
                    .setProperty(PARENT_ID, purchaseTransaction.getId())
                    .setProperty(PURCHASE_PRICE_PROP, purchasePrice.toString())
                    .setProperty(PURCHASE_AMOUNT_PROP, purchaseAmount.toString())
                    .setProperty(PURCHASE_EXC_RATE_PROP, purchaseExcRate?.toString())
                    .setProperty(FWD_PURCHASE_PRICE_PROP, fwdPurchasePrice?.toString())
                    .setProperty(FWD_PURCHASE_AMOUNT_PROP, fwdPurchaseAmount?.toString())
                    .setProperty(FWD_PURCHASE_EXC_RATE_PROP, fwdPurchaseExcRate?.toString())

                if (shortSale) {
                    splittedPurchaseTransaction
                        .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                        .setProperty(SALE_PRICE_PROP, salePrice.toString())
                        .setProperty(SALE_AMOUNT_PROP, saleAmount.toString())
                        .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
                        .setProperty(FWD_SALE_PRICE_PROP, fwdSalePrice?.toString())
                        .setProperty(FWD_SALE_AMOUNT_PROP, fwdSaleAmount?.toString())
                        .setProperty(SALE_DATE_PROP, saleTransaction.getProperty(DATE_PROP) || saleTransaction.getDate())
                        .setProperty(GAIN_AMOUNT_PROP, gain.toString())
                        .setProperty(SHORT_SALE_PROP, 'true')
                } else {
                    longSaleLiquidationLogEntries.push(logLiquidation(saleTransaction, salePrice, saleExcRate));
                    splittedPurchaseTransaction.setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(longSaleLiquidationLogEntries));
                }

                splittedPurchaseTransaction.post().check()

                if (shortSale) {
                    recordRealizedResult(baseBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, splittedPurchaseTransaction, gain, gainBaseNoFX, summary);
                    recordFxGain(stockExcCode, baseBook, unrealizedFxBaseAccount, splittedPurchaseTransaction, gainBaseWithFX, gainBaseNoFX, summary)
                    if (autoMtM) {
                        markToMarket(stockBook, splittedPurchaseTransaction, stockAccount, financialBook, unrealizedAccount, purchasePrice, gain)
                    }
                    // Make sure splitted purchase transaction is already posted so it has an id
                    shortSaleLiquidationLogEntries.push(logLiquidation(splittedPurchaseTransaction, purchasePrice, purchaseExcRate));
                }

                soldQuantity = soldQuantity.minus(partialBuyQuantity);

                if (!shortSale) {
                    purchaseTotal = purchaseTotal.plus(purchaseAmount);
                    saleTotal = saleTotal.plus(saleAmount);
                    fwdSaleTotal = fwdSaleTotal.plus(fwdSaleAmount)
                    fwdPurchaseTotal = fwdPurchaseTotal.plus(fwdPurchaseAmount);
                    gainTotal = gainTotal.plus(gain);
                    gainBaseNoFxTotal = gainBaseNoFxTotal.plus(gainBaseNoFX);
                    gainBaseWithFxTotal = gainBaseWithFxTotal.plus(gainBaseWithFX);
                    purchaseLogEntries.push(logPurchase(stockBook, partialBuyQuantity, purchasePrice, purchaseTransaction, purchaseExcRate))
                    if (fwdPurchasePrice) {
                        fwdPurchaseLogEntries.push(logPurchase(stockBook, partialBuyQuantity, fwdPurchasePrice, purchaseTransaction, fwdPurchaseExcRate))
                    } else {
                        fwdPurchaseLogEntries.push(logPurchase(stockBook, partialBuyQuantity, purchasePrice, purchaseTransaction, purchaseExcRate))
                    }
                }

            }

            if (soldQuantity.lte(0)) {
                break;
            }

        }


        if (soldQuantity.round(stockBook.getFractionDigits()).eq(0)) {
            let saleTxChanged = false;
            if (shortSaleLiquidationLogEntries.length > 0) {
                saleTransaction
                    .setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(shortSaleLiquidationLogEntries))
                    .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                    .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
                saleTxChanged = true;
            }
            if (purchaseLogEntries.length > 0) {
                saleTransaction
                    .setProperty(PURCHASE_AMOUNT_PROP, purchaseTotal.toString())
                    .setProperty(SALE_AMOUNT_PROP, saleTotal.toString())
                    .setProperty(GAIN_AMOUNT_PROP, gainTotal.toString())
                    .setProperty(PURCHASE_LOG_PROP, JSON.stringify(purchaseLogEntries))
                    .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())

                if (fwdPurchaseLogEntries.length > 0) {
                    saleTransaction
                        .setProperty(FWD_PURCHASE_AMOUNT_PROP, !fwdPurchaseTotal.eq(0) ? fwdPurchaseTotal?.toString() : null)
                        .setProperty(FWD_SALE_AMOUNT_PROP, !fwdSaleTotal.eq(0) ? fwdSaleTotal.toString() : null)
                        .setProperty(FWD_PURCHASE_LOG_PROP, JSON.stringify(fwdPurchaseLogEntries))
                        .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
                }
                saleTxChanged = true;
            }
            if (saleTxChanged) {
                saleTransaction.update();
            }
            saleTransaction.check();
        } else if (soldQuantity.round(stockBook.getFractionDigits()).gt(0)) {

            let remainingSaleQuantity = saleTransaction.getAmount().minus(soldQuantity);

            if (!remainingSaleQuantity.eq(0)) {

                saleTransaction
                    .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                    .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
                    .setAmount(soldQuantity)
                    .update();

                let splittedSaleTransaction = stockBook.newTransaction()
                    .setDate(saleTransaction.getDate())
                    .setAmount(remainingSaleQuantity)
                    .setCreditAccount(saleTransaction.getCreditAccount())
                    .setDebitAccount(saleTransaction.getDebitAccount())
                    .setDescription(saleTransaction.getDescription())
                    .setProperty(ORDER_PROP, saleTransaction.getProperty(ORDER_PROP))
                    .setProperty(DATE_PROP, saleTransaction.getProperty(DATE_PROP))
                    .setProperty(PARENT_ID, saleTransaction.getId())
                    .setProperty(SALE_PRICE_PROP, salePrice.toString())
                    .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                    .setProperty(FWD_SALE_PRICE_PROP, fwdSalePrice?.toString())
                    .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
                if (shortSaleLiquidationLogEntries.length > 0) {
                    splittedSaleTransaction.setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(shortSaleLiquidationLogEntries));
                }
                if (purchaseLogEntries.length > 0) {
                    splittedSaleTransaction
                        .setProperty(PURCHASE_AMOUNT_PROP, purchaseTotal.toString())
                        .setProperty(SALE_AMOUNT_PROP, saleTotal.toString())
                        .setProperty(GAIN_AMOUNT_PROP, gainTotal.toString())
                        .setProperty(PURCHASE_LOG_PROP, JSON.stringify(purchaseLogEntries))

                    if (fwdPurchaseLogEntries.length > 0) {
                        splittedSaleTransaction
                            .setProperty(FWD_PURCHASE_AMOUNT_PROP, !fwdPurchaseTotal.eq(0) ? fwdPurchaseTotal?.toString() : null)
                            .setProperty(FWD_SALE_AMOUNT_PROP, !fwdSaleTotal.eq(0) ? fwdSaleTotal.toString() : null)
                            .setProperty(FWD_PURCHASE_LOG_PROP, JSON.stringify(fwdPurchaseLogEntries))
                    }
                }

                splittedSaleTransaction.post().check()

                //Override to have the RR FX and MtM associated to the splitted on
                saleTransaction = splittedSaleTransaction;
            }

        }

        recordRealizedResult(baseBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, saleTransaction, gainTotal, gainBaseNoFxTotal, summary);
        recordFxGain(stockExcCode, baseBook, unrealizedFxBaseAccount, saleTransaction, gainBaseWithFxTotal, gainBaseNoFxTotal, summary)
        if (autoMtM && purchaseProcessed && !saleTransaction.getProperty(LIQUIDATION_LOG_PROP)) {
            markToMarket(stockBook, saleTransaction, stockAccount, financialBook, unrealizedAccount, salePrice, gainTotal)
        }

    }


    function getUnrealizedAccount(stockAccount: StockAccount | Bkper.Account, book: Bkper.Book, summary: Summary, stockExcCode: string) {
        let unrealizedAccountName = `${stockAccount.getName()} ${UNREALIZED_SUFFIX}`;
        let unrealizedAccount = book.getAccount(unrealizedAccountName);
        if (unrealizedAccount == null) {
            unrealizedAccount = book.newAccount()
                .setName(unrealizedAccountName)
                .setType(BkperApp.AccountType.LIABILITY);
            let groups = getAccountGroups(book, UNREALIZED_SUFFIX);
            groups.forEach(group => unrealizedAccount.addGroup(group));
            unrealizedAccount.create();
            trackAccountCreated(summary, stockExcCode, unrealizedAccount);
        }
        return unrealizedAccount;
    }

    function getUnrealizedFxAccount(stockAccount: StockAccount, book: Bkper.Book, summary: Summary, stockExcCode: string) {
        let unrealizedFxAccountName = `${stockAccount.getName()} ${UNREALIZED_SUFFIX} EXC`;
        let unrealizedFxAccount = book.getAccount(unrealizedFxAccountName);
        if (unrealizedFxAccount == null) {
            unrealizedFxAccount = book.newAccount()
                .setName(unrealizedFxAccountName)
                .setType(BkperApp.AccountType.LIABILITY);
            let groups = getAccountGroups(book, `${UNREALIZED_SUFFIX} EXC`);
            groups.forEach(group => unrealizedFxAccount.addGroup(group));
            unrealizedFxAccount.create();
            trackAccountCreated(summary, stockExcCode, unrealizedFxAccount);
        }
        return unrealizedFxAccount;
    }

    function recordRealizedResult(
        baseBook: Bkper.Book,
        stockAccount: StockAccount,
        stockExcCode: string,
        financialBook: Bkper.Book,
        unrealizedAccount: Bkper.Account,
        transaction: Bkper.Transaction,
        gain: Bkper.Amount,
        gainBaseNoFX: Bkper.Amount,
        summary: Summary
    ) {
        const gainDate = transaction.getProperty(DATE_PROP) || transaction.getDate();

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
                .setProperty(EXC_AMOUNT_PROP, getStockGainLossTransactionExcAmountProp(financialBook, isBaseBook, gainBaseNoFX))
                .setProperty(EXC_CODE_PROP, getStockGainLossTransactionExcCodeProp(financialBook, isBaseBook, baseBook))
                .from(realizedGainAccount)
                .to(unrealizedAccount)
                .post().check()
            ;

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
                .setProperty(EXC_AMOUNT_PROP, getStockGainLossTransactionExcAmountProp(financialBook, isBaseBook, gainBaseNoFX))
                .setProperty(EXC_CODE_PROP, getStockGainLossTransactionExcCodeProp(financialBook, isBaseBook, baseBook))
                .from(unrealizedAccount)
                .to(realizedLossAccount)
                .post().check()
            ;

        }
    }

    function getStockGainLossTransactionExcAmountProp(financialBook: Bkper.Book, isBaseBook: boolean, gainBaseNoFX: Bkper.Amount): string {
        if (!BotService.hasBaseBookDefined(financialBook)) {
            return null;
        }
        return isBaseBook ? null : gainBaseNoFX.abs().toString();
    }

    function getStockGainLossTransactionExcCodeProp(financialBook: Bkper.Book, isBaseBook: boolean, baseBook: Bkper.Book): string {
        if (!BotService.hasBaseBookDefined(financialBook)) {
            return null;
        }
        return isBaseBook ? null : BotService.getExcCode(baseBook);
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
        price: Bkper.Amount,
        gain: Bkper.Amount
    ): void {

        const date = transaction.getProperty(DATE_PROP) ? stockBook.parseDate(transaction.getProperty(DATE_PROP)) : transaction.getDateObject();
        let totalQuantity = getAccountBalance(stockBook, stockAccount, date);
        let financialInstrument = financialBook.getAccount(stockAccount.getName());
        let balance = getAccountBalance(financialBook, financialInstrument, date);
        let newBalance = totalQuantity.times(price);

        let amount = newBalance.minus(balance);
        if (amount.round(financialBook.getFractionDigits()).gt(0)) {
            financialBook.newTransaction()
                .setDate(date)
                .setAmount(amount)
                .setDescription(`#mtm`)
                .setProperty(PRICE_PROP, financialBook.formatAmount(price))
                .setProperty(OPEN_QUANTITY_PROP, totalQuantity.toFixed(stockBook.getFractionDigits()))
                .from(unrealizedAccount)
                .to(financialInstrument)
                .addRemoteId(`mtm_${transaction.getId()}`)
                .post().check()
            ;
        } else if (amount.round(financialBook.getFractionDigits()).lt(0)) {
            financialBook.newTransaction()
                .setDate(date)
                .setAmount(amount)
                .setDescription(`#mtm`)
                .setProperty(PRICE_PROP, financialBook.formatAmount(price))
                .setProperty(OPEN_QUANTITY_PROP, totalQuantity.toFixed(stockBook.getFractionDigits()))
                .from(financialInstrument)
                .to(unrealizedAccount)
                .addRemoteId(`mtm_${transaction.getId()}`)
                .post().check()
            ;
        }
    }

    function recordInterestAccountMtm(book: Bkper.Book, account: Bkper.Account, urAccount: Bkper.Account, amount: Bkper.Amount, date: string, remoteId: string): void {
        if (amount.gt(0)) {
            book.newTransaction()
                .setDate(date)
                .setAmount(amount)
                .setDescription(`#interest_mtm`)
                .from(account)
                .to(urAccount)
                .addRemoteId(`interestmtm_${remoteId}`)
                .post().check()
            ;
        } else if (amount.lt(0)) {
            book.newTransaction()
                .setDate(date)
                .setAmount(amount.abs())
                .setDescription(`#interest_mtm`)
                .from(urAccount)
                .to(account)
                .addRemoteId(`interestmtm_${remoteId}`)
                .post().check()
            ;
        }
    }

    function getLastTransactionId(sales: Bkper.Transaction[], purchases: Bkper.Transaction[]): string | null {
        const transactions = [...sales.concat(purchases)].sort(BotService.compareToFIFO);
        if (transactions.length > 0) {
            const lastTransaction = transactions[transactions.length - 1];
            if (lastTransaction) {
                return lastTransaction.getId();
            }
        }
        return null;
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
        unrealizedFxAccount: Bkper.Account,
        transaction: Bkper.Transaction,
        gainBaseWithFx: Bkper.Amount,
        gainBaseNoFx: Bkper.Amount,
        summary: Summary
    ): void {

        const gainDate = transaction.getProperty(DATE_PROP) || transaction.getDate();

        if (!gainBaseWithFx) {
            console.log('Missing gain with FX')
            return;
        }

        if (!gainBaseNoFx) {
            console.log('Missing gain no FX')
            return;
        }

        let excAccountName = getExcAccountName(baseBook, unrealizedFxAccount, stockExcCode);

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
                .to(unrealizedFxAccount)
                .post().check();

        } else if (fxGain.round(baseBook.getFractionDigits()).lt(0)) {

            baseBook.newTransaction()
                .addRemoteId(`fx_` + transaction.getId())
                .setDate(gainDate)
                .setAmount(fxGain)
                .setDescription(`#exchange_loss`)
                .setProperty(EXC_AMOUNT_PROP, '0')
                .from(unrealizedFxAccount)
                .to(excAccount)
                .post().check();

        }

    }


    function getExcAccountName(baseBook: Bkper.Book, connectedAccount: Bkper.Account, connectedCode: string): string {
        let excAccount = connectedAccount.getProperty(EXC_ACCOUNT_PROP)
        if (excAccount) {
            return excAccount;
        }
        let groups = connectedAccount.getGroups();
        if (groups) {
            for (const group of groups) {
                excAccount = group.getProperty(EXC_ACCOUNT_PROP)
                if (excAccount) {
                    return excAccount;
                }
            }
        }
        let excAggregateProp = baseBook.getProperty(EXC_AGGREGATE_PROP);
        if (excAggregateProp) {
            return `Exchange_${connectedCode}`;
        }
        return `${connectedAccount.getName().replace(UNREALIZED_SUFFIX, REALIZED_SUFFIX)}`;
    }

    function getExcAccountGroups(book: Bkper.Book): Set<Bkper.Group> {
        let accountNames = new Set<string>();

        book.getAccounts().forEach(account => {
            let accountName = account.getProperty(EXC_ACCOUNT_PROP);
            if (accountName) {
                accountNames.add(accountName);
            }
            if (account.getName().startsWith('Exchange_')) {
                accountNames.add(account.getName());
            }
            if (account.getName().endsWith(` EXC`)) {
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

    function getExcAccountType(book: Bkper.Book): Bkper.AccountType {
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
            if (account.getName().endsWith(` EXC`)) {
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
