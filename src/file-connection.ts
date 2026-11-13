// Only the file handle is retained here. Tournament data stays in the JSON file.
export async function fileConnection(write = false, handle?: unknown): Promise<unknown> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('mixed-file-connection', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('connection');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('connection', write ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('connection');
      const request = write
        ? handle === undefined
          ? store.delete('file')
          : store.put(handle, 'file')
        : store.get('file');
      transaction.oncomplete = () => resolve(write ? undefined : request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
