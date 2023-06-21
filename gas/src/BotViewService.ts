namespace BotViewService {

    export function getBotViewTemplate(baseBookId: string, baseAccountId: string, baseGroupId: string): GoogleAppsScript.HTML.HtmlOutput {

        let baseBook = BkperApp.getBook(baseBookId);
        let baseAccount = baseBook.getAccount(baseAccountId);
        let baseGroup = baseBook.getGroup(baseGroupId);

        let stockBook = BotService.getStockBook(baseBook);

        if (stockBook == null) {
            throw 'No book with 0 decimal places found in the collection';
        }

        const template = HtmlService.createTemplateFromFile('BotView');

        template.dateToday = Utilities.formatDate(new Date(), baseBook.getTimeZone(), 'yyyy-MM-dd');

        template.enableReset = true;

        if (stockBook.getPermission() == BkperApp.Permission.OWNER && checkIfAllBooksAreUnlocked(baseBook)) {
            template.enableFullReset = true;
        } else {
            template.enableFullReset = false;
        }

        template.book = {
            id: stockBook.getId(),
            name: stockBook.getName(),
        }

        template.accounts = [];
        template.group = {}

        let accountsExcCodes = new Set<string>();

        if (baseAccount) {
            let stockAccount = stockBook.getAccount(baseAccount.getName());
            addAccount(stockAccount);
        } else if (baseGroup) {
            let stockGroup = stockBook.getGroup(baseGroup.getName());
            if (stockGroup) {
                template.group = {
                    id: baseGroup.getId(),
                    name: baseGroup.getName()
                }
                for (const account of stockGroup.getAccounts()) {
                    addAccount(account);
                }
            }
        } else {
            for (const account of BotService.getUncalculatedOrRebuildAccounts(stockBook)) {
                addAccount(account);
            }
            template.enableReset = false;
            template.enableFullReset = false;
        }

        function addAccount(account: Bkper.Account) {
            if (!account) {
                return;
            }
            const stockAccount = new StockAccount(account);
            if (!stockAccount.isPermanent() || stockAccount.isArchived() || !stockAccount.getExchangeCode()) {
                //bypass non permanent accounts
                return;
            }
            if (baseAccount == null || (baseAccount != null && baseAccount.getNormalizedName() == stockAccount.getNormalizedName())) {
                template.accounts.push({
                    id: stockAccount.getId(),
                    name: stockAccount.getName()
                });
                accountsExcCodes.add(stockAccount.getExchangeCode());
            }
        }

        template.accounts.sort((a: { name: string; }, b: { name: string; }) => a.name.localeCompare(b.name));

        const bookExcCodesUserCanEdit = BotService.getFinancialBooksExcCodesUserCanEdit(baseBook);

        let bookExcCodesUserCannotEdit: string[] = [];
        for (const code of Array.from(accountsExcCodes)) {
            if (!bookExcCodesUserCanEdit.has(code)) {
                bookExcCodesUserCannotEdit.push(code);
            }
        }

        if (bookExcCodesUserCannotEdit.length > 0) {
            template.permissionGranted = false;
            template.permissionError = `User needs EDITOR or OWNER permission in ${bookExcCodesUserCannotEdit.join(', ')} books`;
        } else {
            template.permissionGranted = true;
        }

        return template.evaluate().setTitle('Stock Bot');
    }

    function checkIfAllBooksAreUnlocked(baseBook: Bkper.Book): boolean {
        let books = baseBook.getCollection().getBooks();
        for (const book of books) {
            if ((!book.getLockDate() || book.getLockDate() == '1900-00-00') && (!book.getClosingDate() || book.getClosingDate() == '1900-00-00')) {
                continue;
            } else {
                return false;
            };
        };
        return true;
    }
}