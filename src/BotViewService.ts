

namespace BotViewService_ {

  export function getBotViewTemplate(bookId: string, accountId: string): GoogleAppsScript.HTML.HtmlOutput {
    let book = BkperApp.getBook(bookId);
    const template = HtmlService.createTemplateFromFile('BotView');
  
    template.book = {
      id: bookId,
      name: book.getName(),
    }
    template.account = {
      id: accountId
    }

    return template.evaluate().setTitle('Stock Bot');
  }


  export function gainLossIncremental(bookId: string, accountId: string): void {

  }

  export function gainLossRebuild(bookId: string, accountId: string): void {
  }

}
