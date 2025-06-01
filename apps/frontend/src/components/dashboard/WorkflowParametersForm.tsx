// Workflow parameters form component
// Provides language selection and processing options with validation

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Languages, Volume2 } from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_WORKFLOW_PARAMS,
  type SupportedLanguage,
} from '@inkstream/shared';
import { type WorkflowFormData } from '@/types/dashboard';

// Validation schema
const workflowParametersSchema = z.object({
  doTranslate: z.boolean(),
  doSpeech: z.boolean(),
  targetLanguage: z.string(),
});

type FormData = z.infer<typeof workflowParametersSchema>;

interface WorkflowParametersFormProps {
  onSubmit: (params: WorkflowFormData) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function WorkflowParametersForm({
  onSubmit,
  isLoading,
  disabled = false,
}: WorkflowParametersFormProps) {
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(workflowParametersSchema),
    defaultValues: {
      doTranslate: DEFAULT_WORKFLOW_PARAMS.doTranslate,
      doSpeech: DEFAULT_WORKFLOW_PARAMS.doSpeech,
      targetLanguage: DEFAULT_WORKFLOW_PARAMS.targetLanguage,
    },
    mode: 'onChange',
  });

  const doTranslate = watch('doTranslate');
  const doSpeech = watch('doSpeech');
  const targetLanguage = watch('targetLanguage');

  const handleFormSubmit = (data: FormData) => {
    // Convert form data to WorkflowFormData
    const params: WorkflowFormData = {
      doTranslate: data.doTranslate,
      doSpeech: data.doSpeech,
      targetLanguage: data.targetLanguage,
    };
    onSubmit(params);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Translation Options */}
      <Card className="border-0 shadow-none bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Languages className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="doTranslate" className="text-base font-medium">
                  Enable Translation
                </Label>
                <p className="text-sm text-muted-foreground">
                  Translate the extracted text to your chosen language
                </p>
              </div>
            </div>
            <Switch
              id="doTranslate"
              checked={doTranslate}
              onCheckedChange={(checked) => setValue('doTranslate', checked)}
              disabled={disabled || isLoading}
            />
          </div>

          {/* Language Selection */}
          {doTranslate && (
            <div className="mt-4 pl-8">
              <Label htmlFor="targetLanguage" className="text-sm font-medium">
                Target Language
              </Label>
              <Select
                value={targetLanguage}
                onValueChange={(value: SupportedLanguage) =>
                  setValue('targetLanguage', value)
                }
                disabled={disabled || isLoading}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select target language" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map(
                    (lang: { code: string; name: string }) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              {errors.targetLanguage && (
                <p className="text-sm text-destructive mt-1">
                  {errors.targetLanguage.message}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Speech Conversion Options */}
      <Card className="border-0 shadow-none bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Volume2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="doSpeech" className="text-base font-medium">
                  Convert to Speech
                </Label>
                <p className="text-sm text-muted-foreground">
                  Generate an audio file from the processed text
                </p>
              </div>
            </div>
            <Switch
              id="doSpeech"
              checked={doSpeech}
              onCheckedChange={(checked) => setValue('doSpeech', checked)}
              disabled={disabled || isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end pt-4">
        <Button
          type="submit"
          disabled={disabled || isLoading || !isValid}
          className="min-w-[140px]"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting...
            </>
          ) : (
            'Start Workflow'
          )}
        </Button>
      </div>
    </form>
  );
}
