import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import apiClient from '../../services/apiClient.js';

export default function PrivateImage({ asset, alt, className = '', onMetadata }) {
  const { token } = useAuth() || {};
  const [loaded, setLoaded] = useState(null);
  const [failed, setFailed] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!asset?.url) return undefined;
    const controller = new AbortController();
    let objectUrl;
    apiClient.get(asset.url, {
      responseType: 'blob', withCredentials: true, signal: controller.signal,
      headers: { Authorization: token ? 'Bearer ' + token : null },
    }).then((response) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(response.data);
      setLoaded({ url: asset.url, token, source: objectUrl, mime: response.data.type, byte_size: response.data.size });
    }).catch((error) => {
      if (!controller.signal.aborted) setFailed({ url: asset.url, token, message: error.message || 'تصویر دریافت نشد.' });
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset?.url, token, revision]);
  if (!asset?.url) return <span className="text-sm text-slate-500">تصویر موجود نیست.</span>;
  if (failed?.url === asset.url && failed.token === token) return <div role="alert" className="space-y-2 break-words text-center text-sm text-rose-600"><p>{failed.message}</p><button type="button" className="btn-soft" onClick={() => { setFailed(null); setLoaded(null); setRevision((value) => value + 1); }}>تلاش مجدد دریافت تصویر</button></div>;
  if (loaded?.url !== asset.url || loaded.token !== token) return <span role="status" className="text-sm text-slate-500">در حال دریافت تصویر...</span>;
  return <img src={loaded.source} alt={alt} className={className}
    onLoad={(event) => onMetadata?.({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight, mime: loaded.mime, byte_size: loaded.byte_size })}
    onError={() => setFailed({ url: asset.url, token, message: 'فایل تصویر قابل نمایش نیست.' })} />;
}
