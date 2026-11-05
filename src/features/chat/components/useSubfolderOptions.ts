import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { projectApi } from '../../../services/http/projectApi';

export interface SubfolderOption {
  value: string;
  label: string;
}

/** Subfolders the person can link a group to: the ones they can work in (all of them for admins). Loads when `enabled`. */
export function useSubfolderOptions(enabled: boolean): SubfolderOption[] {
  const me = useAuthStore((s) => s.user);
  const [options, setOptions] = useState<SubfolderOption[]>([]);

  useEffect(() => {
    if (!enabled || !me) return;
    let cancelled = false;
    projectApi
      .list()
      .then((projects) => Promise.all(projects.map((p) => projectApi.get(p.id).catch(() => null))))
      .then((details) => {
        if (cancelled) return;
        setOptions(
          details.flatMap((d) =>
            d
              ? d.subfolders
                  .filter((s) => me.role === 'admin' || s.can_work)
                  .map((s) => ({ value: s.id, label: `${d.name} › ${s.name}` }))
              : []
          )
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, me]);

  return options;
}
