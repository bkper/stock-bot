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

    template.enableReset = true;
  
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
    }

    function addAccount(account: Bkper.Account) {
      if (!account) {
        return;
      }
      if (!account.isPermanent() || account.isArchived() || !BotService.getStockExchangeCode(account)) {
        //bypass non permanent accounts
        return;
      }
      if (baseAccount == null || (baseAccount != null && baseAccount.getNormalizedName() == account.getNormalizedName())) {
        template.accounts.push({
          id: account.getId(),
          name: account.getName()
        });
      }
    }

    template.accounts.sort((a: { name: string; }, b: { name: string; }) => a.name.localeCompare(b.name));

    return template.evaluate().setTitle('Stock Bot');
  }
}