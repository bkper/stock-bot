
class EventHandlerTransactionUnchecked {

  handleEvent(event: bkper.Event): string | boolean {
    let baseBook = BkperApp.getBook(event.bookId);
    const response = BotService.flagAccountForRebuildIfNeeded(baseBook, event);
    if (response) {
      return response;
    }
    return false;
  }

}