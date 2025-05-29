import { useContext } from 'react';
import { FileProcessingContext } from '../contexts/file-processing-context';

export function useFileProcessing() {
  const context = useContext(FileProcessingContext);
  if (context === undefined) {
    throw new Error(
      'useFileProcessing must be used within a FileProcessingProvider'
    );
  }
  return context;
}
