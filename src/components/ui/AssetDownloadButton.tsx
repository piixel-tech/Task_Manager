import React from 'react';
import { toast } from '../../store/useToastStore';
import { assetApi, type Asset } from '../../services/http/taskApi';
import { DownloadButton } from './DownloadButton';

/** The download button for an uploaded file (task assets, requirement and review attachments, activity files, chat files). */
export const AssetDownloadButton: React.FC<{ asset: Asset; size?: 'sm' | 'md'; className?: string }> = ({ asset, size = 'sm', className }) => (
  <DownloadButton
    size={size}
    className={className}
    label={`Download ${asset.name}`}
    onDownload={(progress) => assetApi.open(asset, progress)}
    onError={(err) => toast.error('Could not open the file', err.message)}
  />
);
