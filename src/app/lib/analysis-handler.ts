/**
 * Analysis Handler
 * 
 * Centralized logic for handling transaction analysis with chunked processing
 */

import { Transaction, GraphAnalysisResult } from './types';
import { uploadAndAnalyze, UploadProgress } from './chunked-uploader';

export interface AnalysisOptions {
  transactions: Transaction[];
  onProgress: (progress: UploadProgress) => void;
}

export async function handleAnalysis(options: AnalysisOptions): Promise<{
  result: GraphAnalysisResult;
  executionTime: number;
}> {
  const startTime = performance.now();
  
  const result = await uploadAndAnalyze(options.transactions, options.onProgress);
  
  const endTime = performance.now();
  const executionTime = endTime - startTime;
  
  return {
    result,
    executionTime
  };
}
