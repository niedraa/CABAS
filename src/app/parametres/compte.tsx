/**
 * Réglages › Compte & données (RGPD) :
 *  - données de santé (art. 9) : consentement, date, retrait (efface allergies
 *    et régimes, le planning se revérifie seul) ;
 *  - statistiques d'usage : OPT-IN, désactivées par défaut ;
 *  - export de toutes les données (art. 20) : fichier JSON partagé / téléchargé ;
 *  - suppression du compte (art. 17) : double confirmation, puis retour à
 *    l'accueil (`/bienvenue`).
 */
import { router, type Href } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { BarChart3, Download, HeartPulse, PenLine, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react-native';

import { EmptyBasket } from '@/components/brand';
import { formatLongDate, sectionHref, SettingsGroup, SettingsRow } from '@/components/feature/account';
import { Badge, Button, ConfirmDialog, Dialog, InfoBanner, Screen, staggerEntering, Switch, useToast } from '@/components/ui';
import { ALLERGEN_LABELS, capitalize, DIET_LABELS, joinFr } from '@/core';
import { isDemoMode } from '@/lib/env';
import { haptics } from '@/lib/haptics';
import { shareExport } from '@/services/account';
import { deleteAccount, useProfileStore, useSettingsStore } from '@/stores';
import { useTheme } from '@/theme';

type DeleteStep = 'closed' | 'first' | 'second';

export default function AccountSettings() {
  const t = useTheme();
  const toast = useToast();
  const profile = useProfileStore((s) => s.profile);
  const analytics = useSettingsStore((s) => s.analyticsConsent);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('closed');
  const [deleting, setDeleting] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));

  const consentAt = profile?.healthDataConsentAt ?? null;
  const healthItems = [...(profile?.allergens ?? []).map((a) => ALLERGEN_LABELS[a]), ...(profile?.diets ?? []).map((d) => DIET_LABELS[d])];
  const healthList = healthItems.length ? capitalize(joinFr(healthItems).toLowerCase()) : null;
  const consentDate = formatLongDate(consentAt);

  const withdraw = () => {
    setConfirmWithdraw(false);
    useProfileStore.getState().setHealthDataConsent(false);
    toast.show({ title: 'Consentement retiré', message: 'Tes allergies et régimes sont effacés de Cabas.', tone: 'neutral' });
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const name = await shareExport();
      toast.show({ title: 'Export prêt', message: name, tone: 'success' });
    } catch (err) {
      toast.show({ title: 'Export impossible', message: err instanceof Error ? err.message : 'Réessaie dans un instant.', tone: 'danger' });
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      setDeleteStep('closed');
      haptics.success();
      toast.show({ title: 'Compte supprimé', message: 'Toutes tes données ont été effacées. À bientôt peut-être !', tone: 'neutral' });
      if (router.canDismiss()) router.dismissAll();
      router.replace('/bienvenue' as Href);
    } catch (err) {
      setDeleting(false);
      setDeleteStep('closed');
      toast.show({ title: 'Suppression impossible', message: err instanceof Error ? err.message : 'Réessaie avec une connexion.', tone: 'danger' });
    }
  };

  return (
    <Screen title="Compte & données" subtitle="Tes données t’appartiennent : tu gardes la main." onBack={back} testID="settings-compte-screen">
      <View style={{ gap: t.spacing.xxl }}>
        <Animated.View entering={staggerEntering(0)}>
          <SettingsGroup
            title="Données de santé"
            note="Utilisées uniquement pour écarter les plats qui ne te conviennent pas. Hébergées en Europe, jamais revendues, jamais dans nos statistiques."
          >
            <SettingsRow
              icon={HeartPulse}
              title={consentAt ? 'Consentement donné' : 'Aucune donnée de santé'}
              subtitle={
                consentAt
                  ? `${consentDate ? `Le ${consentDate}` : 'Accordé'}${healthList ? ` · ${healthList}` : ''}`
                  : 'Tu n’as déclaré ni allergie ni régime.'
              }
              right={consentAt ? <Badge label="Actif" tone="success" size="sm" /> : null}
              testID="health-consent-status"
            />
            <SettingsRow
              icon={PenLine}
              title="Modifier mes allergies et régimes"
              chevron
              onPress={() => router.push(sectionHref('regime') as Href)}
              testID="health-edit"
            />
            {consentAt ? (
              <SettingsRow
                icon={ShieldOff}
                title="Retirer mon consentement"
                subtitle="Efface tes allergies et régimes de Cabas."
                destructive
                onPress={() => {
                  haptics.warning();
                  setConfirmWithdraw(true);
                }}
                testID="health-withdraw"
              />
            ) : null}
          </SettingsGroup>
        </Animated.View>

        <Animated.View entering={staggerEntering(1)}>
          <SettingsGroup title="Statistiques" note="Désactivées par défaut. Tu peux changer d’avis à tout moment.">
            <SettingsRow
              icon={BarChart3}
              title="Statistiques d’usage anonymes"
              subtitle="Pour améliorer Cabas. Sans donnée de santé."
              right={
                <Switch
                  value={analytics}
                  onValueChange={(on) => useSettingsStore.getState().setAnalyticsConsent(on)}
                  accessibilityLabel="Statistiques d’usage anonymes"
                  testID="analytics-switch"
                />
              }
            />
          </SettingsGroup>
        </Animated.View>

        <Animated.View entering={staggerEntering(2)}>
          <SettingsGroup title="Tes données">
            <SettingsRow
              icon={Download}
              title={exporting ? 'Préparation de l’export…' : 'Exporter mes données'}
              subtitle="Un fichier JSON avec tout ce que Cabas sait de toi."
              disabled={exporting}
              chevron
              onPress={() => void exportData()}
              testID="account-export"
            />
            <SettingsRow
              icon={Trash2}
              title="Supprimer mon compte"
              subtitle="Profil, menus, listes, dépenses : tout est effacé."
              destructive
              onPress={() => {
                haptics.warning();
                setDeleteStep('first');
              }}
              testID="account-delete"
            />
          </SettingsGroup>
        </Animated.View>

        <Animated.View entering={staggerEntering(3)}>
          <InfoBanner
            tone={isDemoMode ? 'neutral' : 'success'}
            icon={ShieldCheck}
            message={
              isDemoMode
                ? 'Mode démo : tes données restent uniquement sur cet appareil.'
                : 'Tes données sont hébergées en Europe et protégées par le RGPD.'
            }
          />
        </Animated.View>
      </View>

      <ConfirmDialog
        visible={confirmWithdraw}
        onClose={() => setConfirmWithdraw(false)}
        onConfirm={withdraw}
        title="Retirer ton consentement ?"
        message={
          healthItems.length
            ? `Cabas effacera ${joinFr(healthItems).toLowerCase()} et ne pourra plus écarter ces plats de tes menus.`
            : 'Cabas ne pourra plus tenir compte d’allergies ou de régimes.'
        }
        confirmLabel="Retirer et effacer"
        destructive
        testID="withdraw-confirm"
      />

      <ConfirmDialog
        visible={deleteStep === 'first'}
        onClose={() => setDeleteStep('closed')}
        onConfirm={() => {
          haptics.warning();
          setDeleteStep('second');
        }}
        illustration={<EmptyBasket size={96} />}
        title="Supprimer ton compte ?"
        message="Ton profil, tes menus, tes listes, ton placard et tes dépenses seront effacés. Pense à exporter tes données avant."
        confirmLabel="Continuer"
        destructive
        testID="delete-confirm-1"
      />

      <Dialog
        visible={deleteStep === 'second'}
        onClose={() => !deleting && setDeleteStep('closed')}
        dismissible={!deleting}
        title="C’est définitif"
        message="Une fois supprimé, rien ne pourra être récupéré. On efface tout ?"
        testID="delete-confirm-2"
        actions={
          <>
            <Button
              label="Supprimer définitivement"
              variant="danger"
              haptic="impact"
              loading={deleting}
              fullWidth
              onPress={() => void remove()}
              testID="delete-final"
            />
            <Button label="Garder mon compte" variant="ghost" fullWidth disabled={deleting} onPress={() => setDeleteStep('closed')} />
          </>
        }
      />
    </Screen>
  );
}
