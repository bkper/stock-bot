namespace RealizedResultsService {

    export function calculateRealizedResultsForAccountAsync(stockBookId: string, stockAccountId: string, autoMtM: boolean, toDate: string): Summary {

        let stockBook = BkperApp.getBook(stockBookId);
        if (!toDate) {
            toDate = stockBook.formatDate(new Date());
        }

        let stockAccount = new StockAccount(stockBook.getAccount(stockAccountId));

        let historical = stockBook.getProperty(STOCK_HISTORICAL_PROP) && stockBook.getProperty(STOCK_HISTORICAL_PROP).toLowerCase() == 'true' ? true : false;

        const summary = new Summary(stockAccount.getId());

        if (stockAccount.needsRebuild()) {
            // Fire reset async
            RealizedResultsService.resetRealizedResultsForAccountAsync(stockBook, stockAccount, false);
            return summary.rebuild();
        }

        let stockExcCode = stockAccount.getExchangeCode();
        let financialBook = BotService.getFinancialBook(stockBook, stockExcCode);
        // Skip
        if (financialBook == null) {
            return summary;
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

        // Processor
        const processor = new RealizedResultsProcessor(stockBook, financialBook, baseBook);

        // Process sales
        for (const saleTransaction of stockAccountSaleTransactions) {
            if (stockAccountPurchaseTransactions.length > 0) {
                processSale(baseBook, financialBook, stockExcCode, stockBook, stockAccount, saleTransaction, stockAccountPurchaseTransactions, summary, autoMtM, historical, processor);
            }
        }

        // Check & record exchange rates if missing
        checkAndRecordExchangeRates(baseBook, financialBook, stockAccountSaleTransactions, stockAccountPurchaseTransactions, processor);

        // Check & record Interest account MTM if necessary
        if (autoMtM) {
            const financialInterestAccount = BotService.getInterestAccount(financialBook, stockAccount.getName());
            const lastTransactionId = getLastTransactionId(stockAccountSaleTransactions, stockAccountPurchaseTransactions);
            if (financialInterestAccount && lastTransactionId) {
                checkAndRecordInterestMtm(stockAccount, stockBook, financialInterestAccount, financialBook, toDate, lastTransactionId, summary, processor);
            }
        }

        // Fire batch operations
        processor.fireBatchOperations();

        checkLastTxDate(stockAccount, stockAccountSaleTransactions, stockAccountPurchaseTransactions);

        return summary.calculatingAsync();

    }

    function checkAndRecordExchangeRates(baseBook: Bkper.Book, financialBook: Bkper.Book, saleTransactions: Bkper.Transaction[], purchaseTransactions: Bkper.Transaction[], processor: RealizedResultsProcessor): void {
        for (const saleTx of saleTransactions) {
            if (!saleTx.isChecked()) {
                recordExcRateProp(baseBook, financialBook, saleTx, SALE_EXC_RATE_PROP, processor);
            }
        }
        for (const purchaseTx of purchaseTransactions) {
            if (!purchaseTx.isChecked()) {
                recordExcRateProp(baseBook, financialBook, purchaseTx, PURCHASE_EXC_RATE_PROP, processor);
            }
        }
    }

    function recordExcRateProp(baseBook: Bkper.Book, financialBook: Bkper.Book, transaction: Bkper.Transaction, exchangeRateProperty: string, processor: RealizedResultsProcessor): void {
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
            // transaction.update();
            // Store transaction to be updated
            processor.setStockBookTransactionToUpdate(transaction);
        }
    }

    function checkAndRecordInterestMtm(principalStockAccount: StockAccount, stockBook: Bkper.Book, financialInterestAccount: Bkper.Account, financialBook: Bkper.Book, onDateIso: string, lastTransactionId: string, summary: Summary, processor: RealizedResultsProcessor): void {
        // Check principal account quantity on Stock Book
        const principalQuantity = getAccountBalance(stockBook, principalStockAccount, stockBook.parseDate(onDateIso));
        if (principalQuantity.eq(0)) {
            // Check interest account balance on Financial Book
            const interestBalance = getAccountBalance(financialBook, financialInterestAccount, financialBook.parseDate(onDateIso));
            if (!interestBalance.eq(0)) {
                // Record interest account MTM on financial book
                const financialUnrealizedAccount = getUnrealizedAccount(financialInterestAccount, financialBook, summary, principalStockAccount.getExchangeCode());
                recordInterestAccountMtm(financialBook, financialInterestAccount, financialUnrealizedAccount, interestBalance, onDateIso, lastTransactionId, processor);
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

    function processSale(baseBook: Bkper.Book, financialBook: Bkper.Book, stockExcCode: string, stockBook: Bkper.Book, stockAccount: StockAccount, saleTransaction: Bkper.Transaction, purchaseTransactions: Bkper.Transaction[], summary: Summary, autoMtM: boolean, historical: boolean, processor: RealizedResultsProcessor): void {

        // Log operation status
        console.log(`processing sale: ${saleTransaction.getId()}`);

        // Sale info: quantity, prices, exchange rates
        let soldQuantity = saleTransaction.getAmount();
        const salePrice: Bkper.Amount = BkperApp.newAmount(saleTransaction.getProperty(SALE_PRICE_PROP, PRICE_PROP));
        const fwdSalePrice: Bkper.Amount = saleTransaction.getProperty(FWD_SALE_PRICE_PROP) ? BkperApp.newAmount(saleTransaction.getProperty(FWD_SALE_PRICE_PROP)) : salePrice;
        const saleExcRate = BotService.getExcRate(baseBook, financialBook, saleTransaction, SALE_EXC_RATE_PROP);
        const fwdSaleExcRate = BotService.getFwdExcRate(saleTransaction, FWD_SALE_EXC_RATE_PROP, saleExcRate);

        let purchaseTotal = BkperApp.newAmount(0);
        let saleTotal = BkperApp.newAmount(0);

        let gainTotal = BkperApp.newAmount(0);
        let gainBaseNoFxTotal = BkperApp.newAmount(0);
        let gainBaseWithFxTotal = BkperApp.newAmount(0);

        let fwdPurchaseTotal = BkperApp.newAmount(0);
        let fwdSaleTotal = BkperApp.newAmount(0);

        // Unrealized accounts
        const excAggregateProp = baseBook.getProperty(EXC_AGGREGATE_PROP);
        const unrealizedAccount = getUnrealizedAccount(stockAccount, financialBook, summary, stockExcCode);
        const unrealizedFxBaseAccount = excAggregateProp ? getUnrealizedAccount(stockAccount, baseBook, summary, stockExcCode) : getUnrealizedFxAccount(stockAccount, baseBook, summary, stockExcCode);

        let purchaseLogEntries: PurchaseLogEntry[] = [];
        let fwdPurchaseLogEntries: PurchaseLogEntry[] = [];

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

            const shortSale = isShortSale(purchaseTransaction, saleTransaction);

            // Purchase info: quantity, prices, exchange rates
            const purchaseExcRate = BotService.getExcRate(baseBook, financialBook, purchaseTransaction, PURCHASE_EXC_RATE_PROP);
            const fwdPurchaseExcRate = BotService.getFwdExcRate(purchaseTransaction, FWD_PURCHASE_EXC_RATE_PROP, purchaseExcRate);
            const purchasePrice: Bkper.Amount = BkperApp.newAmount(purchaseTransaction.getProperty(PURCHASE_PRICE_PROP, PRICE_PROP));
            const fwdPurchasePrice: Bkper.Amount = purchaseTransaction.getProperty(FWD_PURCHASE_PRICE_PROP) ? BkperApp.newAmount(purchaseTransaction.getProperty(FWD_PURCHASE_PRICE_PROP)) : purchasePrice;
            const purchaseQuantity = purchaseTransaction.getAmount();

            // Sold quantity GTE purchase quantity: update & check purchase transaction
            if (soldQuantity.gte(purchaseQuantity)) {

                const saleAmount = salePrice.times(purchaseQuantity);
                const purchaseAmount = purchasePrice.times(purchaseQuantity);
                const fwdSaleAmount = fwdSalePrice.times(purchaseQuantity);
                const fwdPurchaseAmount = fwdPurchasePrice.times(purchaseQuantity);

                let gain = saleAmount.minus(purchaseAmount);
                let gainBaseNoFX = BotService.calculateGainBaseNoFX(gain, purchaseExcRate, saleExcRate, shortSale);
                let gainBaseWithFX = BotService.calculateGainBaseWithFX(purchaseAmount, purchaseExcRate, saleAmount, saleExcRate);

                if (!historical) {
                    // Override if not historical
                    gain = fwdSaleAmount.minus(fwdPurchaseAmount);
                    gainBaseNoFX = BotService.calculateGainBaseNoFX(gain, fwdPurchaseExcRate, fwdSaleExcRate, shortSale);
                    gainBaseWithFX = BotService.calculateGainBaseWithFX(fwdPurchaseAmount, fwdPurchaseExcRate, fwdSaleAmount, fwdSaleExcRate);
                }

                if (!shortSale) {
                    purchaseTotal = purchaseTotal.plus(purchaseAmount);
                    saleTotal = saleTotal.plus(saleAmount);
                    fwdPurchaseTotal = fwdPurchaseTotal.plus(fwdPurchaseAmount);
                    fwdSaleTotal = fwdSaleTotal.plus(fwdSaleAmount);
                    gainTotal = gainTotal.plus(gain);
                    gainBaseNoFxTotal = gainBaseNoFxTotal.plus(gainBaseNoFX);
                    gainBaseWithFxTotal = gainBaseWithFxTotal.plus(gainBaseWithFX);
                    purchaseLogEntries.push(logPurchase(stockBook, purchaseQuantity, purchasePrice, purchaseTransaction, purchaseExcRate));
                    if (fwdPurchasePrice) {
                        fwdPurchaseLogEntries.push(logPurchase(stockBook, purchaseQuantity, fwdPurchasePrice, purchaseTransaction, fwdPurchaseExcRate));
                    } else {
                        fwdPurchaseLogEntries.push(logPurchase(stockBook, purchaseQuantity, purchasePrice, purchaseTransaction, purchaseExcRate));
                    }
                }

                purchaseTransaction
                    .setProperty(PURCHASE_PRICE_PROP, purchasePrice.toString())
                    .setProperty(PURCHASE_AMOUNT_PROP, purchaseAmount.toString())
                    .setProperty(PURCHASE_EXC_RATE_PROP, purchaseExcRate?.toString())
                    .setProperty(FWD_PURCHASE_AMOUNT_PROP, fwdPurchaseAmount?.toString())
                ;
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
                    ;
                } else {
                    longSaleLiquidationLogEntries.push(logLiquidation(saleTransaction, salePrice, saleExcRate));
                    purchaseTransaction.setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(longSaleLiquidationLogEntries));
                }

                // purchaseTransaction.update();
                // Store transaction to be updated
                purchaseTransaction.setChecked(true);
                processor.setStockBookTransactionToUpdate(purchaseTransaction);

                if (shortSale) {
                    // RR
                    addRealizedResult(baseBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, purchaseTransaction, gain, gainBaseNoFX, summary, processor);
                    // FX
                    addFxResult(stockExcCode, baseBook, unrealizedFxBaseAccount, purchaseTransaction, gainBaseWithFX, gainBaseNoFX, summary, processor);
                    // MTM
                    if (autoMtM) {
                        addMarkToMarket(stockBook, purchaseTransaction, stockAccount, financialBook, unrealizedAccount, purchasePrice, gain, processor);
                    }
                }

                // purchaseTransaction.check();

                soldQuantity = soldQuantity.minus(purchaseQuantity);

            // Sold quantity LT purchase quantity: update purchase + update & check splitted purchase transaction
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
                    // Override if not historical
                    gain = fwdSaleAmount.minus(fwdPurchaseAmount);
                    gainBaseNoFX = BotService.calculateGainBaseNoFX(gain, fwdPurchaseExcRate, fwdSaleExcRate, shortSale);
                    gainBaseWithFX = BotService.calculateGainBaseWithFX(fwdPurchaseAmount, fwdPurchaseExcRate, fwdSaleAmount, fwdSaleExcRate);
                }

                purchaseTransaction
                    .setAmount(remainingBuyQuantity)
                    .setProperty(PURCHASE_EXC_RATE_PROP, purchaseExcRate?.toString())
                    .setProperty(FWD_PURCHASE_EXC_RATE_PROP, fwdPurchaseExcRate?.toString())
                    // .update()
                ;
                // Store transaction to be updated
                processor.setStockBookTransactionToUpdate(purchaseTransaction);

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
                ;
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
                    ;
                } else {
                    longSaleLiquidationLogEntries.push(logLiquidation(saleTransaction, salePrice, saleExcRate));
                    splittedPurchaseTransaction.setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(longSaleLiquidationLogEntries));
                }

                // Post & check splitted purchase: ID is required in order to post RR, FX and MTM transactions
                // splittedPurchaseTransaction.post().check();

                // Store transaction to be created: create temporaty id as remoteId in order to wrap up c
                splittedPurchaseTransaction
                    .setChecked(true)
                    .addRemoteId(`${processor.generateTemporaryId()}`)
                ;
                processor.setStockBookTransactionToCreate(splittedPurchaseTransaction);

                if (shortSale) {
                    // RR
                    addRealizedResult(baseBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, splittedPurchaseTransaction, gain, gainBaseNoFX, summary, processor);
                    // FX
                    addFxResult(stockExcCode, baseBook, unrealizedFxBaseAccount, splittedPurchaseTransaction, gainBaseWithFX, gainBaseNoFX, summary, processor);
                    // MTM
                    if (autoMtM) {
                        addMarkToMarket(stockBook, splittedPurchaseTransaction, stockAccount, financialBook, unrealizedAccount, purchasePrice, gain, processor);
                    }
                    shortSaleLiquidationLogEntries.push(logLiquidation(splittedPurchaseTransaction, purchasePrice, purchaseExcRate));
                }

                soldQuantity = soldQuantity.minus(partialBuyQuantity);

                if (!shortSale) {
                    purchaseTotal = purchaseTotal.plus(purchaseAmount);
                    saleTotal = saleTotal.plus(saleAmount);
                    fwdSaleTotal = fwdSaleTotal.plus(fwdSaleAmount);
                    fwdPurchaseTotal = fwdPurchaseTotal.plus(fwdPurchaseAmount);
                    gainTotal = gainTotal.plus(gain);
                    gainBaseNoFxTotal = gainBaseNoFxTotal.plus(gainBaseNoFX);
                    gainBaseWithFxTotal = gainBaseWithFxTotal.plus(gainBaseWithFX);
                    purchaseLogEntries.push(logPurchase(stockBook, partialBuyQuantity, purchasePrice, purchaseTransaction, purchaseExcRate));
                    if (fwdPurchasePrice) {
                        fwdPurchaseLogEntries.push(logPurchase(stockBook, partialBuyQuantity, fwdPurchasePrice, purchaseTransaction, fwdPurchaseExcRate));
                    } else {
                        fwdPurchaseLogEntries.push(logPurchase(stockBook, partialBuyQuantity, purchasePrice, purchaseTransaction, purchaseExcRate));
                    }
                }

            }

            // Break loop if sale is fully processed, otherwise proceed to next purchase
            if (soldQuantity.lte(0)) {
                break;
            }

        }

        // Sold quantity EQ zero: update & check sale transaction
        if (soldQuantity.round(stockBook.getFractionDigits()).eq(0)) {

            let saleTxChanged = false;
            if (shortSaleLiquidationLogEntries.length > 0) {
                saleTransaction
                    .setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(shortSaleLiquidationLogEntries))
                    .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                    .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
                ;
                saleTxChanged = true;
            }
            if (purchaseLogEntries.length > 0) {
                saleTransaction
                    .setProperty(PURCHASE_AMOUNT_PROP, purchaseTotal.toString())
                    .setProperty(SALE_AMOUNT_PROP, saleTotal.toString())
                    .setProperty(GAIN_AMOUNT_PROP, gainTotal.toString())
                    .setProperty(PURCHASE_LOG_PROP, JSON.stringify(purchaseLogEntries))
                    .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                ;
                if (fwdPurchaseLogEntries.length > 0) {
                    saleTransaction
                        .setProperty(FWD_PURCHASE_AMOUNT_PROP, !fwdPurchaseTotal.eq(0) ? fwdPurchaseTotal?.toString() : null)
                        .setProperty(FWD_SALE_AMOUNT_PROP, !fwdSaleTotal.eq(0) ? fwdSaleTotal.toString() : null)
                        .setProperty(FWD_PURCHASE_LOG_PROP, JSON.stringify(fwdPurchaseLogEntries))
                        .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
                    ;
                }
                saleTxChanged = true;
            }
            // if (saleTxChanged) {
            //     saleTransaction.update();
            // }
            // saleTransaction.check();
            if (saleTxChanged) {
                // Store transaction to be updated
                saleTransaction.setChecked(true);
                processor.setStockBookTransactionToUpdate(saleTransaction);
            } else {
                // Store transaction to be checked
                processor.setStockBookTransactionToCheck(saleTransaction);
            }

        // Sold quantity GT zero: update sale + update & check splitted sale transaction
        } else if (soldQuantity.round(stockBook.getFractionDigits()).gt(0)) {

            let remainingSaleQuantity = saleTransaction.getAmount().minus(soldQuantity);

            if (!remainingSaleQuantity.eq(0)) {

                saleTransaction
                    .setProperty(SALE_EXC_RATE_PROP, saleExcRate?.toString())
                    .setProperty(FWD_SALE_EXC_RATE_PROP, fwdSaleExcRate?.toString())
                    .setAmount(soldQuantity)
                    // .update()
                ;
                // Store transaction to be updated
                processor.setStockBookTransactionToUpdate(saleTransaction);

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
                ;
                if (shortSaleLiquidationLogEntries.length > 0) {
                    splittedSaleTransaction.setProperty(LIQUIDATION_LOG_PROP, JSON.stringify(shortSaleLiquidationLogEntries));
                }
                if (purchaseLogEntries.length > 0) {
                    splittedSaleTransaction
                        .setProperty(PURCHASE_AMOUNT_PROP, purchaseTotal.toString())
                        .setProperty(SALE_AMOUNT_PROP, saleTotal.toString())
                        .setProperty(GAIN_AMOUNT_PROP, gainTotal.toString())
                        .setProperty(PURCHASE_LOG_PROP, JSON.stringify(purchaseLogEntries))
                    ;
                    if (fwdPurchaseLogEntries.length > 0) {
                        splittedSaleTransaction
                            .setProperty(FWD_PURCHASE_AMOUNT_PROP, !fwdPurchaseTotal.eq(0) ? fwdPurchaseTotal?.toString() : null)
                            .setProperty(FWD_SALE_AMOUNT_PROP, !fwdSaleTotal.eq(0) ? fwdSaleTotal.toString() : null)
                            .setProperty(FWD_PURCHASE_LOG_PROP, JSON.stringify(fwdPurchaseLogEntries))
                        ;
                    }
                }

                // Post & check: ID is required in order to post RR, FX and MTM transactions
                // splittedSaleTransaction.post().check();

                // Store transaction to be created: create temporaty id as remoteId in order to wrap up c
                splittedSaleTransaction
                    .setChecked(true)
                    .addRemoteId(`${processor.generateTemporaryId()}`)
                ;
                processor.setStockBookTransactionToCreate(splittedSaleTransaction);

                // Override to have the RR, FX and MTM associated to the splitted tx
                saleTransaction = splittedSaleTransaction;
            }

        }

        // RR
        addRealizedResult(baseBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, saleTransaction, gainTotal, gainBaseNoFxTotal, summary, processor);
        // FX
        addFxResult(stockExcCode, baseBook, unrealizedFxBaseAccount, saleTransaction, gainBaseWithFxTotal, gainBaseNoFxTotal, summary, processor);
        // MTM
        if (autoMtM && purchaseProcessed && !saleTransaction.getProperty(LIQUIDATION_LOG_PROP)) {
            addMarkToMarket(stockBook, saleTransaction, stockAccount, financialBook, unrealizedAccount, salePrice, gainTotal, processor);
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

    function addRealizedResult(
        baseBook: Bkper.Book,
        stockAccount: StockAccount,
        stockExcCode: string,
        financialBook: Bkper.Book,
        unrealizedAccount: Bkper.Account,
        transaction: Bkper.Transaction,
        gain: Bkper.Amount,
        gainBaseNoFX: Bkper.Amount,
        summary: Summary,
        processor: RealizedResultsProcessor
    ) {

        const gainDate = transaction.getProperty(DATE_PROP) || transaction.getDate();
        const isBaseBook = baseBook.getId() == financialBook.getId();

        if (gain.round(financialBook.getFractionDigits()).gt(0)) {

            const realizedGainAccountName = `${stockAccount.getName()} ${REALIZED_SUFFIX}`;
            let realizedGainAccount = financialBook.getAccount(realizedGainAccountName);

            // Fallback to old XXX Realized Gain account
            if (realizedGainAccount == null) {
                realizedGainAccount = financialBook.getAccount(`${stockAccount.getName()} Realized Gain`);
            }

            // Create new XXX Realized account
            if (realizedGainAccount == null) {
                realizedGainAccount = financialBook.newAccount().setName(realizedGainAccountName).setType(BkperApp.AccountType.INCOMING);
                let groups = getAccountGroups(financialBook, REALIZED_SUFFIX);
                groups.forEach(group => realizedGainAccount.addGroup(group));
                realizedGainAccount.create();
                trackAccountCreated(summary, stockExcCode, realizedGainAccount);
            }

            const remoteId = transaction.getId() || processor.getTemporaryId(transaction);

            const rrTransaction = financialBook.newTransaction()
                .addRemoteId(remoteId)
                .setDate(gainDate)
                .setAmount(gain)
                .setDescription(`#stock_gain`)
                .setProperty(EXC_AMOUNT_PROP, getStockGainLossTransactionExcAmountProp(financialBook, isBaseBook, gainBaseNoFX))
                .setProperty(EXC_CODE_PROP, getStockGainLossTransactionExcCodeProp(financialBook, isBaseBook, baseBook))
                .from(realizedGainAccount)
                .to(unrealizedAccount)
                .setChecked(true)
                // .post().check()
            ;

            // Store transaction to be created
            processor.setFinancialBookTransactionToCreate(rrTransaction);

        } else if (gain.round(financialBook.getFractionDigits()).lt(0)) {

            const realizedLossAccountName = `${stockAccount.getName()} ${REALIZED_SUFFIX}`;
            let realizedLossAccount = financialBook.getAccount(realizedLossAccountName);

            // Fallback to old XXX Realized Loss account
            if (realizedLossAccount == null) {
                realizedLossAccount = financialBook.getAccount(`${stockAccount.getName()} Realized Loss`);
            }

            // Create new XXX Realized account
            if (realizedLossAccount == null) {
                realizedLossAccount = financialBook.newAccount().setName(realizedLossAccountName).setType(BkperApp.AccountType.OUTGOING);
                let groups = getAccountGroups(financialBook, REALIZED_SUFFIX);
                groups.forEach(group => realizedLossAccount.addGroup(group));
                realizedLossAccount.create();
                trackAccountCreated(summary, stockExcCode, realizedLossAccount);
            }

            const remoteId = transaction.getId() || processor.getTemporaryId(transaction);

            const rrTransaction = financialBook.newTransaction()
                .addRemoteId(remoteId)
                .setDate(gainDate)
                .setAmount(gain)
                .setDescription(`#stock_loss`)
                .setProperty(EXC_AMOUNT_PROP, getStockGainLossTransactionExcAmountProp(financialBook, isBaseBook, gainBaseNoFX))
                .setProperty(EXC_CODE_PROP, getStockGainLossTransactionExcCodeProp(financialBook, isBaseBook, baseBook))
                .from(unrealizedAccount)
                .to(realizedLossAccount)
                .setChecked(true)
                // .post().check()
            ;

            // Store transaction to be created
            processor.setFinancialBookTransactionToCreate(rrTransaction);

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
        summary.pushAccount(stockExcCode, account.getName());
    }

    function addMarkToMarket(
        stockBook: Bkper.Book,
        transaction: Bkper.Transaction,
        stockAccount: StockAccount,
        financialBook: Bkper.Book,
        unrealizedAccount: Bkper.Account,
        price: Bkper.Amount,
        gain: Bkper.Amount,
        processor: RealizedResultsProcessor
    ): void {

        // Remote id
        const remoteId = transaction.getId() || processor.getTemporaryId(transaction);
        // Date
        const isoDate = transaction.getProperty(DATE_PROP) || transaction.getDate();
        const date = stockBook.parseDate(isoDate);
        // Quantity amount
        const totalQuantity = getAccountBalance(stockBook, stockAccount, date);
        // Financial amount
        const financialInstrument = financialBook.getAccount(stockAccount.getName());
        const balance = getAccountBalance(financialBook, financialInstrument, date);
        const newBalance = totalQuantity.times(price);
        const amount = newBalance.minus(balance.plus(processor.getMtmBalance(isoDate)));

        if (amount.round(financialBook.getFractionDigits()).gt(0)) {
            const mtmTx = financialBook.newTransaction()
                .setDate(date)
                .setAmount(amount)
                .setDescription(`#mtm`)
                .setProperty(PRICE_PROP, financialBook.formatAmount(price))
                .setProperty(OPEN_QUANTITY_PROP, totalQuantity.toFixed(stockBook.getFractionDigits()))
                .from(unrealizedAccount)
                .to(financialInstrument)
                .addRemoteId(`mtm_${remoteId}`)
                .setChecked(true)
                // .post().check()
            ;
            processor.setFinancialBookTransactionToCreate(mtmTx);
        } else if (amount.round(financialBook.getFractionDigits()).lt(0)) {
            const mtmTx = financialBook.newTransaction()
                .setDate(date)
                .setAmount(amount)
                .setDescription(`#mtm`)
                .setProperty(PRICE_PROP, financialBook.formatAmount(price))
                .setProperty(OPEN_QUANTITY_PROP, totalQuantity.toFixed(stockBook.getFractionDigits()))
                .from(financialInstrument)
                .to(unrealizedAccount)
                .addRemoteId(`mtm_${remoteId}`)
                .setChecked(true)
                // .post().check()
            ;
            processor.setFinancialBookTransactionToCreate(mtmTx);
        }
    }

    function recordInterestAccountMtm(book: Bkper.Book, account: Bkper.Account, urAccount: Bkper.Account, amount: Bkper.Amount, date: string, remoteId: string, processor: RealizedResultsProcessor): void {
        if (amount.gt(0)) {
            const interestMtmTx = book.newTransaction()
                .setDate(date)
                .setAmount(amount)
                .setDescription(`#interest_mtm`)
                .from(account)
                .to(urAccount)
                .addRemoteId(`interestmtm_${remoteId}`)
                .setChecked(true)
                // .post().check()
            ;
            processor.setFinancialBookTransactionToCreate(interestMtmTx);
        } else if (amount.lt(0)) {
            const interestMtmTx = book.newTransaction()
                .setDate(date)
                .setAmount(amount.abs())
                .setDescription(`#interest_mtm`)
                .from(urAccount)
                .to(account)
                .addRemoteId(`interestmtm_${remoteId}`)
                .setChecked(true)
                // .post().check()
            ;
            processor.setFinancialBookTransactionToCreate(interestMtmTx);
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


    function addFxResult(
        stockExcCode: string,
        baseBook: Bkper.Book,
        unrealizedFxAccount: Bkper.Account,
        transaction: Bkper.Transaction,
        gainBaseWithFx: Bkper.Amount,
        gainBaseNoFx: Bkper.Amount,
        summary: Summary,
        processor: RealizedResultsProcessor
    ): void {

        const gainDate = transaction.getProperty(DATE_PROP) || transaction.getDate();

        if (!gainBaseWithFx) {
            console.log('Missing gain with FX');
            return;
        }
        if (!gainBaseNoFx) {
            console.log('Missing gain no FX');
            return;
        }

        const excAccountName = getExcAccountName(baseBook, unrealizedFxAccount, stockExcCode);

        // Verify Exchange account created
        let excAccount = baseBook.getAccount(excAccountName);
        if (excAccount == null) {
            excAccount = baseBook.newAccount().setName(excAccountName);
            let groups = getExcAccountGroups(baseBook);
            groups.forEach(group => excAccount.addGroup(group));
            let type = getExcAccountType(baseBook);
            excAccount.setType(type);
            excAccount.create();
            trackAccountCreated(summary, stockExcCode, excAccount);
        }

        const fxGain = gainBaseWithFx.minus(gainBaseNoFx);
        const remoteId = transaction.getId() || processor.getTemporaryId(transaction);

        if (fxGain.round(baseBook.getFractionDigits()).gt(0)) {

            const fxTransaction = baseBook.newTransaction()
                .addRemoteId(`fx_` + remoteId)
                .setDate(gainDate)
                .setAmount(fxGain)
                .setDescription(`#exchange_gain`)
                .setProperty(EXC_AMOUNT_PROP, '0')
                .from(excAccount)
                .to(unrealizedFxAccount)
                .setChecked(true)
                // .post().check();
            ;

            // Store transaction to be created
            processor.setBaseBookTransactionToCreate(fxTransaction);

        } else if (fxGain.round(baseBook.getFractionDigits()).lt(0)) {

            const fxTransaction = baseBook.newTransaction()
                .addRemoteId(`fx_` + remoteId)
                .setDate(gainDate)
                .setAmount(fxGain)
                .setDescription(`#exchange_loss`)
                .setProperty(EXC_AMOUNT_PROP, '0')
                .from(unrealizedFxAccount)
                .to(excAccount)
                .setChecked(true)
                // .post().check();
            ;

            // Store transaction to be created
            processor.setBaseBookTransactionToCreate(fxTransaction);

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
