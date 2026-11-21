import React, { useId, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  RefreshCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { ErrorAlert } from '../components/LoadingEmptyError';
import { WorkflowStepper } from '../components/WorkflowStepper';
import { usePortal } from '../context/PortalContext';
import { formatFileSize } from '../lib/validation';

export const UploadPage: React.FC = () => {
  const {
    capabilities,
    selectedFiles,
    fileAlertError,
    clearFileAlertError,
    addFiles,
    removeFile,
    retryFileUpload,
    navigate,
  } = usePortal();

  const fileInputId = useId();
  const [isDragging, setIsDragging] = useState(false);

  const maxFiles = capabilities?.maxFilesPerJob ?? 5;
  const maxBytes = capabilities?.maxFileSizeBytes ?? 20 * 1024 * 1024;
  const uploadedCount = selectedFiles.filter((f) => f.status === 'uploaded').length;
  const uploadingAny = selectedFiles.some((f) => f.status === 'uploading');
  const hasErrors = selectedFiles.some((f) => f.status === 'error');
  const canContinue = uploadedCount > 0 && !uploadingAny;

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void addFiles(files);
  };

  return (
    <div className="space-y-4">
      <WorkflowStepper currentStep="upload" />

      <section className="portal-card p-5 sm:p-6 space-y-4">
        <div>
          <h1 className="text-[22px] sm:text-[24px] font-bold leading-tight">
            Upload your documents
          </h1>
          <p className="text-[13.5px] text-[var(--color-text-muted)] mt-1">
            Accepted formats: <strong>PDF, JPG, JPEG, PNG</strong> · Up to{' '}
            <span className="tabular-nums font-semibold">{maxFiles}</span> files · Max{' '}
            <span className="tabular-nums font-semibold">{formatFileSize(maxBytes)}</span> per file.
          </p>
        </div>

        {/* Accessible Touch-Friendly File Picker & Dropzone */}
        <label
          htmlFor={fileInputId}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFilesSelected(e.dataTransfer.files);
          }}
          className={`block rounded-[18px] border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-[var(--ac-cyan)] bg-[var(--ac-cyan-soft)]'
              : 'border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] hover:border-[var(--ac-cyan)]'
          }`}
        >
          <input
            id={fileInputId}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="sr-only"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="w-12 h-12 mx-auto rounded-[14px] bg-[#111318] text-[#25C7D9] flex items-center justify-center mb-3">
            <UploadCloud size={24} aria-hidden="true" />
          </div>
          <div className="text-[15px] font-bold text-[var(--color-text-primary)]">
            {selectedFiles.length >= maxFiles
              ? `Maximum ${maxFiles} files selected`
              : 'Tap to choose PDF or Image files'}
          </div>
          <div className="text-[12.5px] text-[var(--color-text-muted)] mt-1">
            Works with Android Files, iOS Files / Photos, or drag & drop
          </div>
        </label>

        {fileAlertError && (
          <ErrorAlert
            title="File check failed"
            message={fileAlertError}
            onRetry={clearFileAlertError}
          />
        )}

        {/* Selected File List with Progress, Remove & Retry (Spec §7.2) */}
        {selectedFiles.length === 0 ? (
          <div
            className="portal-card-subtle p-4 text-center text-[13px] text-[var(--color-text-muted)]"
            role="status"
          >
            No files selected yet. Choose at least one PDF, JPG, or PNG file to continue.
          </div>
        ) : (
          <div className="space-y-2.5" aria-live="polite">
            <div className="flex items-center justify-between text-[12.5px] font-semibold text-[var(--color-text-muted)]">
              <span>
                Selected Files (<span className="tabular-nums">{selectedFiles.length}</span>/{maxFiles})
              </span>
              <span className="tabular-nums">{uploadedCount} ready</span>
            </div>

            <ul className="space-y-2.5">
              {selectedFiles.map((item) => (
                <li
                  key={item.localId}
                  className="portal-card-subtle p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <FileText
                        size={18}
                        className="text-[var(--color-accent)] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-bold truncate">{item.filename}</div>
                        <div className="text-[12px] text-[var(--color-text-muted)] tabular-nums">
                          {formatFileSize(item.fileSizeBytes)} · Est. {item.estimatedPageCount}{' '}
                          {item.estimatedPageCount === 1 ? 'page' : 'pages'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {item.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => void retryFileUpload(item.localId)}
                          aria-label={`Retry upload for ${item.filename}`}
                          className="min-h-[44px] px-2.5 rounded-[10px] text-[12.5px] font-bold text-[var(--color-accent)] hover:bg-[var(--ac-cyan-soft)] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw size={14} />
                          <span>Retry</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(item.localId)}
                        aria-label={`Remove ${item.filename}`}
                        className="min-w-[44px] min-h-[44px] rounded-[10px] text-[var(--color-text-muted)] hover:text-[var(--bad)] hover:bg-[var(--bad-soft)] inline-flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Progress / Status Row */}
                  {item.status === 'uploading' && (
                    <div className="space-y-1">
                      <div className="h-2 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--ac-cyan)] transition-all duration-150"
                          style={{ width: `${item.progressPct}%` }}
                        />
                      </div>
                      <div className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums">
                        Uploading to encrypted staging... {item.progressPct}%
                      </div>
                    </div>
                  )}

                  {item.status === 'uploaded' && (
                    <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--good)]">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      <span>Uploaded & pre-checked</span>
                    </div>
                  )}

                  {item.status === 'error' && (
                    <div className="text-[12px] font-semibold text-[var(--bad)]">
                      {item.errorMessage || 'Upload failed. Tap Retry to try again.'}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasErrors && (
          <p className="text-[12.5px] text-[var(--warn)] font-medium">
            One or more files failed to upload. Tap Retry on a file or remove it before continuing.
          </p>
        )}

        {/* Navigation Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => navigate('/quick-print')}
            className="portal-btn-secondary px-4 py-2.5 text-[14px] inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back</span>
          </button>

          <button
            type="button"
            disabled={!canContinue}
            onClick={() => navigate('/quick-print/options')}
            className="portal-btn-primary px-5 py-2.5 text-[14.5px] inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{uploadingAny ? 'Uploading...' : 'Continue to Print Options'}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
};
