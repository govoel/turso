import { DatabasePromise, NativeDatabase, SqliteError, DatabaseOpts as CommonDatabaseOpts, EncryptionCipher, Transaction } from "@tursodatabase/database-common"
import { Database as NativeDB, EncryptionCipher as NativeEncryptionCipher } from "#index";

export interface DatabaseOpts extends CommonDatabaseOpts {
    /**
     * Disable automatic WAL maintenance (auto-checkpoint and WAL header
     * restart) at connect time. Required for databases served through
     * `handleSyncRequest()` so sync revisions are never checkpointed away.
     */
    disableWalAutoActions?: boolean;
}

// Map string cipher names to native enum values (lazy to avoid errors if native module lacks encryption)
function getCipherValue(cipher: EncryptionCipher): number {
    if (!NativeEncryptionCipher) {
        throw new Error('Encryption is not supported in this build');
    }
    const cipherMap: Record<EncryptionCipher, number> = {
        'aes128gcm': NativeEncryptionCipher.Aes128Gcm,
        'aes256gcm': NativeEncryptionCipher.Aes256Gcm,
        'aegis256': NativeEncryptionCipher.Aegis256,
        'aegis256x2': NativeEncryptionCipher.Aegis256x2,
        'aegis128l': NativeEncryptionCipher.Aegis128l,
        'aegis128x2': NativeEncryptionCipher.Aegis128x2,
        'aegis128x4': NativeEncryptionCipher.Aegis128x4,
    };
    return cipherMap[cipher];
}

export interface SyncRequest {
    method: string;
    path: string;
    body?: Uint8Array;
}

export interface SyncResponse {
    status: number;
    contentType: string;
    body: Uint8Array;
}

class Database extends DatabasePromise {
    readonly #native: NativeDB;

    constructor(path: string, opts: DatabaseOpts = {}) {
        const nativeOpts: any = { ...opts };
        if (opts.encryption) {
            nativeOpts.encryption = {
                cipher: getCipherValue(opts.encryption.cipher),
                hexkey: opts.encryption.hexkey,
            };
        }
        const native = new NativeDB(path, nativeOpts);
        super(native as unknown as NativeDatabase)
        this.#native = native;
    }

    /**
     * Handles one Turso sync protocol request on this database connection.
     *
     * Authentication, database routing, and HTTP transport are intentionally
     * left to the embedding application.
     */
    async handleSyncRequest(request: SyncRequest): Promise<SyncResponse> {
        await this.connect();
        await this.execLock.acquire();
        try {
            return await this.#native.handleSyncRequestAsync({
                method: request.method,
                path: request.path,
                body: request.body,
            });
        } finally {
            this.execLock.release();
        }
    }
}

/**
 * Creates a new database connection asynchronously.
 * 
 * @param {string} path - Path to the database file.
 * @param {Object} opts - Options for database behavior.
 * @returns {Promise<Database>} - A promise that resolves to a Database instance.
 */
async function connect(path: string, opts: DatabaseOpts = {}): Promise<Database> {
    const db = new Database(path, opts);
    await db.connect();
    return db;
}

export { connect, Database, SqliteError, Transaction }
