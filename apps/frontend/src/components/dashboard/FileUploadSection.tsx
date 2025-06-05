// Enhanced file upload section component
// Provides drag & drop functionality with file validation and preview

import { useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Image, X, AlertCircle } from 'lucide-react';
import { SUPPORTED_FILE_TYPES, MAX_FILE_SIZE } from '@inkstream/shared';
import { toast } from 'sonner';

interface FileUploadSectionProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
}

export function FileUploadSection({
  onFileSelect,
  selectedFile,
}: FileUploadSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File validation
  const validateFile = useCallback((file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File size must be less than ${Math.round(
        MAX_FILE_SIZE / (1024 * 1024)
      )}MB`;
    }

    // Check file type
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (
      !SUPPORTED_FILE_TYPES.includes(
        extension as (typeof SUPPORTED_FILE_TYPES)[number]
      )
    ) {
      return `File type not supported. Please use: ${SUPPORTED_FILE_TYPES.join(
        ', '
      )}`;
    }

    return null;
  }, []);

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        return;
      }
      onFileSelect(file);
    }
  };

  // Handle drag and drop
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file) {
        const error = validateFile(file);
        if (error) {
          toast.error(error);
          return;
        }
        onFileSelect(file);
      }
    },
    [validateFile, onFileSelect]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  // Clear selected file
  const clearFile = () => {
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Get file icon
  const getFileIcon = (fileName: string) => {
    const extension = '.' + fileName.split('.').pop()?.toLowerCase();
    if (['.jpg', '.jpeg', '.png'].includes(extension)) {
      return <Image className="h-8 w-8 text-blue-500" />;
    }
    return <FileText className="h-8 w-8 text-gray-500" />;
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      {!selectedFile ? (
        // Upload Area
        <Card
          className="border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors cursor-pointer"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Upload className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Upload your document</h3>
            <p className="text-muted-foreground text-center mb-4">
              Drag and drop your file here, or click to browse
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUPPORTED_FILE_TYPES.map((type) => (
                <Badge key={type} variant="secondary" className="text-xs">
                  {type.toUpperCase()}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Maximum file size: {Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB
            </p>
          </CardContent>
        </Card>
      ) : (
        // Selected File Display
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getFileIcon(selectedFile.name)}
                <div>
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFile}
                className="h-8 w-8 p-0"
                data-testid="remove-file-button"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_FILE_TYPES.join(',')}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* File requirements info */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Supported formats: {SUPPORTED_FILE_TYPES.join(', ').toUpperCase()}.
          Maximum size: {Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB.
        </AlertDescription>
      </Alert>
    </div>
  );
}
