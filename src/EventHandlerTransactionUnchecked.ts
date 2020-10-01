
class EventHandlerTransactionUnchecked {

  handleEvent(event: bkper.Event): string {
    let baseBook = BkperApp.getBook(event.bookId);
    return BotService.flagAccountForRebuildIfNeeded(baseBook, event);
  }

}