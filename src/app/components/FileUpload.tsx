import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { AlertCircle, Plus, Send, Info, X } from 'lucide-react';
import { cn } from './ui/utils';
import { Transaction } from '../lib/types';

interface FileUploadProps {
  onDataLoaded: (data: Transaction[], filename?: string) => void;
}

const MAX_TRANSACTIONS = 300_000;
const DELIMITERS = [',', '\t', ';', '|'] as const;

// Papa Parse will auto-detect the delimiter

// Helper: detect column keys from a row object
function detectKeys(row: Record<string, any>) {
  const keys = Object.keys(row);
  const findKey = (candidates: string[]) => {
    // First try exact match (case-insensitive)
    const exactMatch = keys.find(k => candidates.includes(k.toLowerCase().trim()));
    if (exactMatch) return exactMatch;

    // Then try partial match – require the candidate to appear as a
    // whole word or at the START/END of the key to avoid false positives
    // e.g. 'orig' should match 'nameOrig' but NOT 'originalprice'
    const partialMatch = keys.find(k => {
      const kl = k.toLowerCase().trim();
      return candidates.some(c => {
        if (c.length < 3) return false; // skip very short candidates for partial match (e.g. 'to')
        // Match if key ends with candidate or candidate is a distinct segment
        return kl.endsWith(c) || kl.startsWith(c) || kl.includes('_' + c) || kl.includes(c + '_');
      });
    });
    if (partialMatch) return partialMatch;

    return '';
  };

  return {
    senderKey: findKey(['sender', 'nameorig', 'source', 'from', 'origin', 'orig',
      'customer', 'account', 'payer', 'buyer', 'client', 'user',
      'accountid', 'customerid', 'client_id', 'sender_id', 'debtor']),
    receiverKey: findKey(['receiver', 'namedest', 'target', 'to', 'destination', 'dest',
      'merchant', 'payee', 'seller', 'beneficiary', 'vendor',
      'merchantid', 'merchant_id', 'receiver_id', 'creditor']),
    amountKey: findKey(['amount', 'value', 'amt', 'sum', 'total', 'transactionamount']),
    timestampKey: findKey(['timestamp', 'date', 'datetime', 'time', 'step', 'created_at', 'tx_date']),
    // PaySim-specific + general fraud dataset column detection
    typeKey: findKey(['type', 'category', 'txtype', 'transaction_type', 'tx_type']),
    isFraudKey: findKey(['isfraud', 'is_fraud', 'fraud', 'label', 'flagged']),
    isFlaggedFraudKey: findKey(['isflaggedfraud', 'is_flagged_fraud', 'flaggedfraud']),
    oldBalanceOrigKey: findKey(['oldbalanceorg', 'oldbalanceorig', 'old_balance_org', 'balance_orig']),
    newBalanceOrigKey: findKey(['newbalanceorig', 'newbalanceorg', 'new_balance_orig']),
    oldBalanceDestKey: findKey(['oldbalancedest', 'old_balance_dest', 'balance_dest']),
    newBalanceDestKey: findKey(['newbalancedest', 'new_balance_dest']),
  };
}

// Parse a single row into a Transaction, returns null if invalid
function parseRow(
  row: Record<string, any>,
  senderKey: string,
  receiverKey: string,
  amountKey: string,
  timestampKey: string,
  now: Date,
  paySimKeys?: {
    typeKey?: string;
    isFraudKey?: string;
    isFlaggedFraudKey?: string;
    oldBalanceOrigKey?: string;
    newBalanceOrigKey?: string;
    oldBalanceDestKey?: string;
    newBalanceDestKey?: string;
  }
): Transaction | null {
  const rawAmount = String(row[amountKey] || '').replace(/[^0-9.-]/g, '');
  const amount = parseFloat(rawAmount);
  if (isNaN(amount)) return null;

  const sender = String(row[senderKey] || '').trim();
  const receiver = String(row[receiverKey] || '').trim();
  if (!sender || !receiver) return null;

  let timestamp = new Date().toISOString();
  if (timestampKey && row[timestampKey]) {
    const val = row[timestampKey];
    if (!isNaN(Number(val)) && String(val).trim().length < 10) {
      // Numeric step column (e.g. PaySim "step")
      const step = Number(val);
      timestamp = new Date(
        now.getTime() - 30 * 24 * 3600 * 1000 + step * 3600 * 1000
      ).toISOString();
    } else {
      const d = new Date(val);
      if (!isNaN(d.getTime())) timestamp = d.toISOString();
    }
  }

  const tx: Transaction = { sender, receiver, amount, timestamp };

  // Attach PaySim-specific fields when columns are present
  if (paySimKeys) {
    if (paySimKeys.typeKey && row[paySimKeys.typeKey]) {
      tx.txType = String(row[paySimKeys.typeKey]).trim().toUpperCase();
    }
    if (paySimKeys.isFraudKey && row[paySimKeys.isFraudKey] !== undefined) {
      // Handle native JSON booleans/numbers AND CSV string values
      const raw = row[paySimKeys.isFraudKey];
      const v = String(raw).trim();
      tx.isFraud = raw === true || raw === 1 || v === '1' || v.toLowerCase() === 'true';
    }
    if (paySimKeys.isFlaggedFraudKey && row[paySimKeys.isFlaggedFraudKey] !== undefined) {
      const raw = row[paySimKeys.isFlaggedFraudKey];
      const v = String(raw).trim();
      tx.isFlaggedFraud = raw === true || raw === 1 || v === '1' || v.toLowerCase() === 'true';
    }
    const parseOpt = (key: string | undefined) => {
      if (!key || !row[key]) return undefined;
      const n = parseFloat(row[key]);
      return isNaN(n) ? undefined : n;
    };
    tx.oldBalanceOrig = parseOpt(paySimKeys.oldBalanceOrigKey);
    tx.newBalanceOrig = parseOpt(paySimKeys.newBalanceOrigKey);
    tx.oldBalanceDest = parseOpt(paySimKeys.oldBalanceDestKey);
    tx.newBalanceDest = parseOpt(paySimKeys.newBalanceDestKey);
  }

  return tx;
}

// Stream-parse a CSV source (File, Blob, or string) with Papa.
// Calls onRow for each parsed row; returning false aborts parsing.
// Returns { processed, hitLimit }
function streamParseCsv(
  source: File | Blob,
  onRow: (row: Record<string, string>) => boolean,
  delimiter?: string
): Promise<void> {
  return new Promise(resolve => {
    Papa.parse<Record<string, string>>(source as File, {
      header: true,
      skipEmptyLines: true,
      // Let PapaParse auto-detect the delimiter
      step(results, parser) {
        const keepGoing = onRow(results.data);
        if (!keepGoing) {
          parser.abort();
          resolve();
        }
      },
      complete: () => resolve(),
      error: () => resolve(),
    });
  });
}

// Delimiter detection removed in favor of PapaParse auto-detection

export function FileUpload({ onDataLoaded }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sampleWarning, setSampleWarning] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };

  const processFile = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setSampleWarning(null);

    try {
      const allTransactions: Transaction[] = [];
      let hitLimit = false;
      const now = new Date();

      // ── ZIP ─────────────────────────────────────────���────────────────────
      if (
        file.name.endsWith('.zip') ||
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed'
      ) {
        const zip = await JSZip.loadAsync(file);
        let processedAny = false;

        for (const filename of Object.keys(zip.files)) {
          if (hitLimit || allTransactions.length >= MAX_TRANSACTIONS) {
            hitLimit = true;
            break;
          }

          const entry = zip.files[filename];
          if (entry.dir || filename.startsWith('__MACOSX') || filename.startsWith('.')) continue;

          if (filename.endsWith('.csv') || filename.endsWith('.tsv')) {
            // Use blob → streaming Papa to avoid loading 2+ GB strings into the JS heap
            const blob = await entry.async('blob');

            let senderKey = '', receiverKey = '', amountKey = '', timestampKey = '';
            let headersDetected = false;
            let zipPaySimKeys: Parameters<typeof parseRow>[6] = undefined;

            await streamParseCsv(blob, (row) => {
              if (!headersDetected) {
                const keys = detectKeys(row);
                senderKey = keys.senderKey;
                receiverKey = keys.receiverKey;
                amountKey = keys.amountKey;
                timestampKey = keys.timestampKey;

                if (!senderKey || !receiverKey || !amountKey) {
                  return false; // abort this file
                }
                // Build PaySim keys when extra columns are present
                if (keys.isFraudKey || keys.typeKey || keys.oldBalanceOrigKey) {
                  zipPaySimKeys = {
                    typeKey: keys.typeKey || undefined,
                    isFraudKey: keys.isFraudKey || undefined,
                    isFlaggedFraudKey: keys.isFlaggedFraudKey || undefined,
                    oldBalanceOrigKey: keys.oldBalanceOrigKey || undefined,
                    newBalanceOrigKey: keys.newBalanceOrigKey || undefined,
                    oldBalanceDestKey: keys.oldBalanceDestKey || undefined,
                    newBalanceDestKey: keys.newBalanceDestKey || undefined,
                  };
                }
                headersDetected = true;
                processedAny = true;
              }

              if (allTransactions.length >= MAX_TRANSACTIONS) {
                hitLimit = true;
                return false; // abort
              }

              const tx = parseRow(row, senderKey, receiverKey, amountKey, timestampKey, now, zipPaySimKeys);
              if (tx) allTransactions.push(tx);
              return true;
            });

          } else if (filename.endsWith('.json')) {
            const content = await entry.async('string');
            try {
              const jsonData = JSON.parse(content);
              if (Array.isArray(jsonData)) {
                for (const item of jsonData) {
                  if (allTransactions.length >= MAX_TRANSACTIONS) { hitLimit = true; break; }
                  const { senderKey, receiverKey, amountKey, timestampKey } = detectKeys(item);
                  if (!senderKey || !receiverKey || !amountKey) break;
                  const tx = parseRow(item, senderKey, receiverKey, amountKey, timestampKey, now);
                  if (tx) allTransactions.push(tx);
                }
                processedAny = true;
              }
            } catch { /* skip bad JSON */ }
          }
        }

        if (!processedAny && allTransactions.length === 0) {
          throw new Error('No valid CSV or JSON files found in the ZIP archive.');
        }

        // ── JSON file ────────────────────────────────────────────────────────
      } else if (file.name.endsWith('.json') || file.type === 'application/json') {
        const content = await file.text();
        let jsonData: any[];
        try { jsonData = JSON.parse(content); } catch { throw new Error('Invalid JSON format'); }
        if (!Array.isArray(jsonData)) throw new Error('JSON file must contain an array of transactions');

        const slice = jsonData.length > MAX_TRANSACTIONS
          ? (hitLimit = true, jsonData.slice(0, MAX_TRANSACTIONS))
          : jsonData;

        for (const item of slice) {
          const { senderKey, receiverKey, amountKey, timestampKey } = detectKeys(item);
          if (!senderKey || !receiverKey || !amountKey) continue;
          const tx = parseRow(item, senderKey, receiverKey, amountKey, timestampKey, now);
          if (tx) allTransactions.push(tx);
        }

        // ── CSV file (direct) ────────────────────────────────────────────────
      } else {
        let senderKey = '', receiverKey = '', amountKey = '', timestampKey = '';
        let headersDetected = false;
        let hasValidHeaders = true;
        let paySimKeys: Parameters<typeof parseRow>[6] = undefined;

        await streamParseCsv(file, (row) => {
          if (!headersDetected) {
            const keys = detectKeys(row);
            senderKey = keys.senderKey;
            receiverKey = keys.receiverKey;
            amountKey = keys.amountKey;
            timestampKey = keys.timestampKey;

            if (!senderKey || !receiverKey || !amountKey) {
              hasValidHeaders = false;
              return false;
            }
            // Build PaySim keys when extra columns are present
            if (keys.isFraudKey || keys.typeKey || keys.oldBalanceOrigKey) {
              paySimKeys = {
                typeKey: keys.typeKey || undefined,
                isFraudKey: keys.isFraudKey || undefined,
                isFlaggedFraudKey: keys.isFlaggedFraudKey || undefined,
                oldBalanceOrigKey: keys.oldBalanceOrigKey || undefined,
                newBalanceOrigKey: keys.newBalanceOrigKey || undefined,
                oldBalanceDestKey: keys.oldBalanceDestKey || undefined,
                newBalanceDestKey: keys.newBalanceDestKey || undefined,
              };
            }
            headersDetected = true;
          }

          if (allTransactions.length >= MAX_TRANSACTIONS) {
            hitLimit = true;
            return false;
          }

          const tx = parseRow(row, senderKey, receiverKey, amountKey, timestampKey, now, paySimKeys);
          if (tx) allTransactions.push(tx);
          return true;
        });

        if (!hasValidHeaders) {
          throw new Error('Missing required fields: sender (or nameOrig), receiver (or nameDest), amount');
        }
      }

      if (allTransactions.length === 0) {
        throw new Error('No valid transactions extracted from the file.');
      }

      // Warn user if we hit the cap
      if (hitLimit) {
        setSampleWarning(
          `Large dataset: loaded the first ${allTransactions.length.toLocaleString()} transactions ` +
          `(cap: ${MAX_TRANSACTIONS.toLocaleString()}). Analysis will run on this sample.`
        );
      }

      // Assign IDs
      const finalData = allTransactions.map((tx, idx) => ({
        ...tx,
        id: tx.id || `tx-${Date.now()}-${idx}`,
      }));

      onDataLoaded(finalData, file.name);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to process file');
    } finally {
      setIsLoading(false);
    }
  };

  const processTextData = async (text: string) => {
    setIsLoading(true);
    setError(null);
    setSampleWarning(null);
    try {
      const trimmed = text.trim();
      if (!trimmed) {
        setError('Please paste transaction data or select a file first.');
        setIsLoading(false);
        return;
      }

      const allTransactions: Transaction[] = [];
      const now = new Date();

      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        let jsonData: any;
        try {
          jsonData = JSON.parse(trimmed);
        } catch (parseErr: any) {
          throw new Error(
            `Invalid JSON syntax: ${parseErr.message}\n\n` +
            'Make sure your JSON is valid. Example:\n' +
            '[{"sender":"Alice","receiver":"Bob","amount":1000}]'
          );
        }

        // Unwrap common nested structures: {"transactions": [...]}, {"data": [...]}, etc.
        let arr: any[];
        if (Array.isArray(jsonData)) {
          arr = jsonData;
        } else if (typeof jsonData === 'object' && jsonData !== null) {
          // Try to find a nested array in common wrapper keys
          const wrapperKeys = ['transactions', 'data', 'records', 'results', 'items', 'rows', 'entries'];
          const nestedArr = wrapperKeys.reduce<any[] | null>((found, key) => {
            if (found) return found;
            const val = jsonData[key] || jsonData[key.charAt(0).toUpperCase() + key.slice(1)];
            return Array.isArray(val) ? val : null;
          }, null);

          if (nestedArr) {
            arr = nestedArr;
          } else {
            // Single object — wrap in array
            arr = [jsonData];
          }
        } else {
          throw new Error(
            'JSON must be an array of transactions or an object containing a transactions array.\n\n' +
            'Example:\n[{"sender":"Alice","receiver":"Bob","amount":1000}]'
          );
        }

        if (arr.length === 0) {
          throw new Error('JSON array is empty — no transactions to analyze.');
        }

        // Show what fields were found if key detection fails on the first item
        let jsonFieldsForError = '';
        let firstItemDetected = false;

        for (const item of arr.slice(0, MAX_TRANSACTIONS)) {
          if (typeof item !== 'object' || item === null) continue;
          const keys = detectKeys(item);

          if (!firstItemDetected) {
            firstItemDetected = true;
            if (!keys.senderKey || !keys.receiverKey || !keys.amountKey) {
              const foundFields = Object.keys(item).join(', ');
              jsonFieldsForError = foundFields;
            }
          }

          if (!keys.senderKey || !keys.receiverKey || !keys.amountKey) continue;
          const psKeys = (keys.isFraudKey || keys.typeKey || keys.oldBalanceOrigKey) ? {
            typeKey: keys.typeKey || undefined,
            isFraudKey: keys.isFraudKey || undefined,
            isFlaggedFraudKey: keys.isFlaggedFraudKey || undefined,
            oldBalanceOrigKey: keys.oldBalanceOrigKey || undefined,
            newBalanceOrigKey: keys.newBalanceOrigKey || undefined,
            oldBalanceDestKey: keys.oldBalanceDestKey || undefined,
            newBalanceDestKey: keys.newBalanceDestKey || undefined,
          } : undefined;
          const tx = parseRow(item, keys.senderKey, keys.receiverKey, keys.amountKey, keys.timestampKey, now, psKeys);
          if (tx) allTransactions.push(tx);
        }

        // Better error for JSON with unrecognized field names
        if (allTransactions.length === 0 && jsonFieldsForError) {
          throw new Error(
            `Could not map JSON fields to transaction columns.\n\n` +
            `Your fields: ${jsonFieldsForError}\n\n` +
            `Expected field names:\n` +
            `  Sender:   "sender", "nameOrig", "source", "from"\n` +
            `  Receiver: "receiver", "nameDest", "target", "to"\n` +
            `  Amount:   "amount", "value", "amt"\n\n` +
            `Example:\n[{"sender":"Alice","receiver":"Bob","amount":1000}]`
          );
        }
      } else {
        // Let Papa Parse auto-detect the delimiter
        const results = Papa.parse<Record<string, string>>(trimmed, {
          header: true,
          skipEmptyLines: true,
        });

        // Check if we got any data (Papa can report minor errors but still parse successfully)
        if (results.data.length === 0) {
          throw new Error('Could not parse data as CSV or JSON. Please check the format.');
        }

        // Detect keys from first valid row
        let senderKey = '';
        let receiverKey = '';
        let amountKey = '';
        let timestampKey = '';
        let pastedPaySimKeys: Parameters<typeof parseRow>[6] = undefined;

        // Try to detect keys from the first few rows (in case first row has empty values)
        for (const row of results.data.slice(0, 5)) {
          const keys = detectKeys(row);
          if (keys.senderKey && keys.receiverKey && keys.amountKey) {
            senderKey = keys.senderKey;
            receiverKey = keys.receiverKey;
            amountKey = keys.amountKey;
            timestampKey = keys.timestampKey;

            if (keys.isFraudKey || keys.typeKey || keys.oldBalanceOrigKey) {
              pastedPaySimKeys = {
                typeKey: keys.typeKey || undefined,
                isFraudKey: keys.isFraudKey || undefined,
                isFlaggedFraudKey: keys.isFlaggedFraudKey || undefined,
                oldBalanceOrigKey: keys.oldBalanceOrigKey || undefined,
                newBalanceOrigKey: keys.newBalanceOrigKey || undefined,
                oldBalanceDestKey: keys.oldBalanceDestKey || undefined,
                newBalanceDestKey: keys.newBalanceDestKey || undefined,
              };
            }
            break; // Keys detected successfully
          }
        }

        // If no valid keys found, throw error
        if (!senderKey || !receiverKey || !amountKey) {
          // Provide helpful debug information
          const availableColumns = results.data.length > 0 ? Object.keys(results.data[0]).join(', ') : 'none';
          throw new Error(
            `Could not detect required columns (sender, receiver, amount).\n\n` +
            `Available columns: ${availableColumns}\n\n` +
            `Expected column names:\n` +
            `- Sender: "sender", "nameOrig", "source", "from", "origin"\n` +
            `- Receiver: "receiver", "nameDest", "target", "to", "destination"\n` +
            `- Amount: "amount", "value", "amt"`
          );
        }

        // Parse all rows using detected keys
        let parsedCount = 0;
        let skippedCount = 0;
        for (const row of results.data.slice(0, MAX_TRANSACTIONS)) {
          const tx = parseRow(row, senderKey, receiverKey, amountKey, timestampKey, now, pastedPaySimKeys);
          if (tx) {
            allTransactions.push(tx);
            parsedCount++;
          } else {
            skippedCount++;
          }
        }

        // If we detected columns but couldn't parse any rows, provide detailed error
        if (allTransactions.length === 0 && parsedCount === 0 && results.data.length > 0) {
          // Show sample of first row data to help debug
          const firstRow = results.data[0];
          const sampleData = [
            `${senderKey}: "${firstRow[senderKey]}"`,
            `${receiverKey}: "${firstRow[receiverKey]}"`,
            `${amountKey}: "${firstRow[amountKey]}"`
          ].join(', ');

          throw new Error(
            `Found columns but could not parse any transactions.\n\n` +
            `Detected columns:\n` +
            `- Sender: "${senderKey}"\n` +
            `- Receiver: "${receiverKey}"\n` +
            `- Amount: "${amountKey}"\n\n` +
            `Sample data from first row:\n${sampleData}\n\n` +
            `Common issues:\n` +
            `- Amount values must be valid numbers\n` +
            `- Sender/receiver values cannot be empty\n` +
            `- Check for data format mismatches`
          );
        }
      }

      if (allTransactions.length === 0) throw new Error(
        'No valid transactions found in the pasted data.\n\n' +
        'Expected CSV with header row (sender, receiver, amount) or JSON array.\n\n' +
        'Example CSV:\nsender,receiver,amount\nAlice,Bob,1000\nBob,Carol,950\n\n' +
        'Example JSON:\n[{"sender":"Alice","receiver":"Bob","amount":1000}]'
      );

      const finalData = allTransactions.map((tx, idx) => ({
        ...tx,
        id: tx.id || `tx-${Date.now()}-${idx}`,
      }));
      onDataLoaded(finalData, 'pasted-data.txt');

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to process text input');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setError(null);
      // Reset file input so the same file can be re-selected
      e.target.value = '';
    }
  };

  // Unified analyze handler: text takes priority, then selected file
  const handleAnalyze = () => {
    const trimmed = inputText.trim();
    if (trimmed) {
      // Always try to process text input — let processTextData decide the format
      // and give a detailed error if parsing fails
      processTextData(inputText);
    } else if (selectedFile) {
      processFile(selectedFile);
      setSelectedFile(null);
    } else {
      setError('Please paste transaction data or select a file first.');
    }
  };

  const handleDemoLoad = () => {
    const dummy: Transaction[] = [];
    const now = Date.now();

    // ── Fraudulent transactions (isFraud: true) ──────────────────────────
    // Circular routing ring: A→B→C→A with decreasing amounts
    dummy.push({ sender: 'A', receiver: 'B', amount: 1000, timestamp: new Date(now).toISOString(), isFraud: true, txType: 'TRANSFER' });
    dummy.push({ sender: 'B', receiver: 'C', amount: 950, timestamp: new Date(now + 3_600_000).toISOString(), isFraud: true, txType: 'TRANSFER' });
    dummy.push({ sender: 'C', receiver: 'A', amount: 900, timestamp: new Date(now + 7_200_000).toISOString(), isFraud: true, txType: 'TRANSFER' });

    // Mule placement
    dummy.push({ sender: 'Mule', receiver: 'Placement1', amount: 5000, timestamp: new Date(now).toISOString(), isFraud: true, txType: 'CASH_OUT' });

    // Fan-in to Mule (smurfing pattern — many small deposits to one account)
    for (let i = 0; i < 10; i++) {
      dummy.push({
        sender: `Source_${i}`, receiver: 'Mule', amount: 500,
        timestamp: new Date(now - 3_600_000 * (i + 1)).toISOString(),
        isFraud: true, txType: 'TRANSFER',
      });
    }

    // ── Legitimate transactions (isFraud: false) ─────────────────────────
    // Normal peer-to-peer payments
    dummy.push({ sender: 'Alice', receiver: 'Bob', amount: 50, timestamp: new Date(now - 86_400_000).toISOString(), isFraud: false, txType: 'PAYMENT' });
    dummy.push({ sender: 'Bob', receiver: 'Charlie', amount: 120, timestamp: new Date(now - 86_400_000 * 2).toISOString(), isFraud: false, txType: 'PAYMENT' });
    dummy.push({ sender: 'Charlie', receiver: 'Dave', amount: 75, timestamp: new Date(now - 86_400_000 * 3).toISOString(), isFraud: false, txType: 'PAYMENT' });
    dummy.push({ sender: 'Dave', receiver: 'Eve', amount: 200, timestamp: new Date(now - 86_400_000 * 4).toISOString(), isFraud: false, txType: 'DEBIT' });
    dummy.push({ sender: 'Eve', receiver: 'Alice', amount: 30, timestamp: new Date(now - 86_400_000 * 5).toISOString(), isFraud: false, txType: 'PAYMENT' });

    // Normal cash-ins / cash-outs
    dummy.push({ sender: 'Merchant1', receiver: 'Alice', amount: 1500, timestamp: new Date(now - 86_400_000 * 6).toISOString(), isFraud: false, txType: 'CASH_IN' });
    dummy.push({ sender: 'Alice', receiver: 'Merchant2', amount: 300, timestamp: new Date(now - 86_400_000 * 7).toISOString(), isFraud: false, txType: 'CASH_OUT' });
    dummy.push({ sender: 'Merchant1', receiver: 'Bob', amount: 800, timestamp: new Date(now - 86_400_000 * 8).toISOString(), isFraud: false, txType: 'CASH_IN' });

    onDataLoaded(dummy.map((t, i) => ({ ...t, id: `demo-${i}` })), 'demo-dataset.csv');
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative flex items-center w-full h-[64px] transition-all duration-200 ease-in-out group',
          isLoading && 'opacity-50 pointer-events-none'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,.zip,application/json,text/csv,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={handleFileChange}
          disabled={isLoading}
        />

        <div className={cn(
          'flex items-center w-full h-full rounded-full transition-colors relative',
          'bg-[#161b22]',
          'hover:bg-[#1c2128]',
          isDragging && 'ring-2 ring-blue-500 bg-blue-950/30'
        )}>
          <div className="pl-4 pr-2 z-10">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors text-slate-400"
              title="Upload file"
            >
              <Plus className="w-6 h-6" strokeWidth={2} />
            </button>
          </div>

          <div className="flex-1 h-[64px] z-10 relative flex items-center">
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAnalyze();
                }
              }}
              className="w-full h-[24px] bg-transparent border-none outline-none text-slate-200 font-inter text-[16px] placeholder:text-slate-500 resize-none overflow-hidden"
              style={{ lineHeight: '24px' }}
              placeholder={isDragging ? 'Drop file here…' : selectedFile ? `File: ${selectedFile.name}` : 'Paste transaction data (JSON/CSV) or drop file…'}
            />
          </div>

          <div className="pr-3 flex items-center gap-2 z-10">
            {isLoading ? (
              <div className="w-10 h-10 rounded-full bg-transparent flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-slate-400 border-t-blue-600 rounded-full animate-spin" />
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAnalyze}
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-white transition-all duration-200',
                  (inputText.length > 0 || selectedFile)
                    ? 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/30'
                    : 'bg-[#30363d] hover:bg-[#3d444d] cursor-pointer'
                )}
                title={inputText.length > 0 ? 'Analyze text' : selectedFile ? `Analyze ${selectedFile.name}` : 'Analyze'}
              >
                <Send className="w-5 h-5" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Selected file indicator */}
      {selectedFile && (
        <div className="mt-2 flex items-center gap-2 px-4">
          <div className="inline-flex items-center gap-1.5 bg-blue-950/30 text-blue-300 text-xs px-3 py-1.5 rounded-full border border-blue-800/50">
            <span className="truncate max-w-[200px]">{selectedFile.name}</span>
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="ml-1 hover:text-blue-100 transition-colors"
              title="Remove file"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <span className="text-xs text-slate-500">Click Analyze to process</span>
        </div>
      )}

      {/* Sample / truncation warning */}
      {sampleWarning && (
        <div className="mt-3 p-3 rounded-lg bg-amber-950/30 text-amber-300 flex items-start gap-2 text-sm border border-amber-800/50">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{sampleWarning}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 rounded-lg bg-red-950/30 text-red-400 flex items-start gap-2 text-sm border border-red-800/50">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="whitespace-pre-line">{error}</span>
        </div>
      )}

      <div className="mt-6 text-center">
        <button
          onClick={handleDemoLoad}
          className="text-blue-400 text-sm hover:text-blue-300 hover:underline font-medium transition-colors"
        >
          Don't have data? Load Demo Dataset
        </button>
      </div>
    </div>
  );
}