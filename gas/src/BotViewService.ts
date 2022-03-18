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

        template.currentYear = new Date().getFullYear();

        template.enableReset = true;

        if (stockBook.getPermission() == BkperApp.Permission.OWNER && stockBook.getLockDate() == '1900-00-00') {
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
            for (const account of stockBook.getAccounts()) {
                addAccount(account);
            }
            template.enableReset = false;
            template.enableFullReset = false;
        }

        function addAccount(account: Bkper.Account) {
            const stockAccount = new StockAccount(account)
            if (!stockAccount) {
                return;
            }
            if (!stockAccount.isPermanent() || stockAccount.isArchived() || !stockAccount.getExchangeCode()) {
                //bypass non permanent accounts
                return;
            }
            if (baseAccount == null || (baseAccount != null && baseAccount.getNormalizedName() == stockAccount.getNormalizedName())) {
                template.accounts.push({
                    id: stockAccount.getId(),
                    name: stockAccount.getName()
                });
            }
        }

        template.accounts.sort((a: { name: string; }, b: { name: string; }) => a.name.localeCompare(b.name));

        return template.evaluate().setTitle('Stock Bot');
    }
}