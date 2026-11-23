/**
 * Compte & données (RGPD) : où sont tes données, export complet (droit
 * d'accès / portabilité), retrait du consentement santé, suppression
 * définitive du compte (droit à l'effacement).
 */
import { router, type Href } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Download, HeartOff, ShieldCheck, Trash2 } from 'lucide-react-native';

import { Button, Card, ConfirmDialog, InfoBanner, ListRow, Screen, Text, useToast } from '@/components/ui';
import { isDemoMode } from '@/lib/env';
import { haptics } from '@/lib/haptics';
import { shareExport } from '@/services/account';
import { deleteAccount, useProfileStore } from '@/stores';
import { useTheme } from '@/theme';

export default function AccountSettings() {
  const t = useTheme();
  const toast = useToast();
  const consentAt = useProfileStore((s) => s.profile?.healthDataConsentAt ?? null);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmConsent, setConfirmConsent] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));

  const exportData = async () => {
    setExporting(true);
    try {
      const name = await shareExport();
      haptics.success();
      toast.show({ title: 'Export prêt', message: name, tone: 'success' });
    } catch (err) {
      toast.show({ title: 'Export impossible', message: err instanceof Error ? err.message : undefined, tone: 'danger' });
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      haptics.success();
      setConfirmDelete(false);
      router.replace('/bienvenue' as Href);
      toast.show({ title: 'Compte supprimé', message: 'Toutes tes données ont été effacées.', tone: 'neutral' });
    } catch (err) {
      haptics.error();
      toast.show({ title: 'Suppression impossible', message: err instanceof Error ? err.message : undefined, tone: 'danger' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Screen title="Compte & données" subtitle="Tes données t’appartiennent." onBack={close} bottomInset="safe" testID="account-screen">
      <View style={{ gap: t.spacing.xl }}>
        <InfoBanner
          tone="info"
          icon={ShieldCheck}
          message={
            isDemoMode
              ? 'Mode démo : tes données restent uniquement sur cet appareil.'
              : 'Tes données sont hébergées dans l’Union européenne et ne sont jamais revendues.'
          }
        />
        <Card variant="plain" padding="none" radius="lg">
          <ListRow
            icon={Download}
            title="Exporter mes données"
            subtitle="Profil, repas, listes, commandes, budget (JSON)"
            onPress={exporting ? undefined : () => void exportData()}
            chevron
            testID="row-export"
          />
          {consentAt ? (
            <ListRow
              icon={HeartOff}
              title="Retirer mon accord santé"
              subtitle="Tes allergies et régimes seront effacés"
              onPress={() => setConfirmConsent(true)}
              chevron
              testID="row-consent"
            />
          ) : null}
        </Card>
        <View style={{ gap: t.spacing.sm }}>
          <Text variant="subhead">Zone sensible</Text>
          <Text variant="footnote" color="textSecondary">
            La suppression efface définitivement ton profil, tes repas, tes listes, tes commandes et ton budget.
          </Text>
          <Button label="Supprimer mon compte" variant="danger" leftIcon={Trash2} onPress={() => setConfirmDelete(true)} testID="delete-account" />
        </View>
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Supprimer ton compte ?"
        message="Toutes tes données seront effacées. C’est définitif."
        confirmLabel="Supprimer définitivement"
        destructive
        loading={deleting}
        testID="delete-confirm"
      />
      <ConfirmDialog
        visible={confirmConsent}
        onClose={() => setConfirmConsent(false)}
        onConfirm={() => {
          useProfileStore.getState().setHealthDataConsent(false);
          setConfirmConsent(false);
          toast.show({ title: 'Accord retiré', message: 'Allergies et régimes effacés.', tone: 'neutral' });
        }}
        title="Retirer ton accord ?"
        message="Cabas ne pourra plus tenir compte de tes allergies et régimes : ils seront effacés."
        confirmLabel="Retirer"
        destructive
      />
    </Screen>
  );
}
