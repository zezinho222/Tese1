import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const TYPE_META = {
  sEMG: { icon: '⚡', subtitle: 'Eletromiografia de Superfície' },
  IMU:  { icon: '🧭', subtitle: 'Unidade de Medição Inercial' },
  EMS:  { icon: '💪', subtitle: 'Eletroestimulação Muscular' },
};

// Estado de calibração — estático por agora, por tipo de módulo
const STATIC_CALIBRATED = {
  sEMG: true,
  IMU: false,
  EMS: false,
};

export default function CalibratePage({ navigation }) {
  const { token } = useAuth();

  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadModules = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await api.getModules(token);
      if (data.success) {
        setModules(data.modules || []);
      } else {
        setError(data.message || 'Erro ao carregar módulos.');
      }
    } catch {
      setError('Sem ligação ao servidor.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Recarrega sempre que a página ganha foco
  useFocusEffect(
    useCallback(() => {
      loadModules();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          style={sharedStyles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Calibrar</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadModules(true)}
              tintColor={colors.primary}
            />
          }
        >
          <Text style={styles.sectionTitle}>Módulos</Text>

          {error !== '' && (
            <View style={[sharedStyles.helperBox, styles.errorBox]}>
              <Text style={[sharedStyles.helperText, styles.errorText]}>{error}</Text>
            </View>
          )}

          {modules.length === 0 && error === '' ? (
            <View style={[sharedStyles.card, styles.emptyCard]}>
              <Text style={styles.emptyIcon}>🔌</Text>
              <Text style={styles.emptyTitle}>Sem módulos ligados</Text>
              <Text style={styles.emptySubtitle}>
                Conecta um módulo na página "Módulos" para o poder calibrar aqui.
              </Text>
            </View>
          ) : (
            <View style={styles.settingsGroup}>
              {modules.map((m) => {
                const meta = TYPE_META[m.type] || TYPE_META.sEMG;
                const calibrated = STATIC_CALIBRATED[m.type] ?? false;

                return (
                  <View
                    key={m._id}
                    style={[sharedStyles.card, styles.settingsCard]}
                  >
                    <View style={[sharedStyles.iconCircle, styles.iconCircle]}>
                      <Text style={sharedStyles.iconText}>{meta.icon}</Text>
                    </View>

                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle}>{m.name}</Text>
                      <Text style={styles.cardSubtitle}>{meta.subtitle}</Text>
                    </View>

                    {calibrated ? (
                      <View style={styles.okBadge}>
                        <Text style={styles.okBadgeText}>OK</Text>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.calibrateBtn} activeOpacity={0.85}>
                        <Text style={styles.calibrateBtnText}>Calibrar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 0,
  },
  backArrow: {
    fontSize: 32,
    color: colors.text.primary,
    fontWeight: '600',
    lineHeight: 32,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 50,
  },

  /* ── Loading ── */
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Scroll ── */
  scroll: {
    paddingBottom: 32,
    gap: 14,
  },

  /* ── Section label ── */
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  /* ── Error ── */
  errorBox: {
    backgroundColor: colors.redBackground,
    borderColor: colors.text.red + '30',
  },
  errorText: {
    color: colors.text.red,
    fontStyle: 'normal',
    textAlign: 'center',
  },

  /* ── Empty state ── */
  emptyCard: {
    backgroundColor: colors.white,
    padding: 32,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* ── Cards ── */
  settingsGroup: {
    gap: 12,
  },
  settingsCard: {
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingRight: 16,
    borderWidth: 1,
  },
  iconCircle: {
    marginRight: 14,
    marginLeft: 10,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 3,
  },

  /* ── Calibrated badge ── */
  okBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  okBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.secondary,
  },

  /* ── Calibrar button ── */
  calibrateBtn: {
    backgroundColor: colors.yellowBackground,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.text.yellow,
  },
  calibrateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.yellow,
  },
});