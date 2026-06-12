import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { ApiError, apiFetch } from '@/lib/api/client';
import { hapticSuccess } from '@/lib/haptics';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

type SupportCategory = 'general' | 'billing' | 'technical' | 'feature_request';

const CATEGORY_OPTIONS: { value: SupportCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'billing', label: 'Billing' },
  { value: 'technical', label: 'Technical' },
  { value: 'feature_request', label: 'Feature' },
];

interface SupportPayload {
  subject: string;
  message: string;
  category: SupportCategory;
  contact_email?: string;
  contact_phone?: string;
}

/**
 * Support screen — mirrors the web /dashboard/support form.
 * Posts to POST /api/venue/support. Available to all roles.
 */
export default function SupportScreen() {
  const accessToken = useAccessToken();
  const toast = useToast();

  const [category, setCategory] = useState<SupportCategory>('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: async (payload: SupportPayload) => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/support', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      hapticSuccess();
      setSent(true);
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : 'Failed to send message. Please try again.';
      toast.error(msg);
    },
  });

  async function handleSubmit() {
    if (!subject.trim() || !message.trim()) {
      toast.error('Please fill in a subject and message.');
      return;
    }
    await mutation.mutateAsync({
      subject: subject.trim(),
      message: message.trim(),
      category,
      ...(contactEmail.trim() ? { contact_email: contactEmail.trim() } : {}),
      ...(contactPhone.trim() ? { contact_phone: contactPhone.trim() } : {}),
    });
  }

  function handleReset() {
    setSent(false);
    setCategory('general');
    setSubject('');
    setMessage('');
    setContactEmail('');
    setContactPhone('');
  }

  const header = <Stack.Screen options={{ title: 'Support' }} />;

  if (sent) {
    return (
      <Screen padded>
        {header}
        <View style={styles.successContainer}>
          <Card>
            <View style={styles.successContent}>
              <Text variant="heading" style={styles.successTitle}>
                Message sent
              </Text>
              <Text variant="bodySmall" tone="secondary" style={styles.successBody}>
                Our support team will get back to you as soon as possible. We typically respond within
                24 hours.
              </Text>
              <Button label="Send another message" variant="secondary" onPress={handleReset} />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="bodySmall" tone="secondary">
          Need help? Send us a message and we&apos;ll get back to you as soon as we can.
        </Text>

        {/* Help centre link */}
        <Card onPress={() => void Linking.openURL('https://resneo.com/help').catch(() => undefined)}>
          <View style={styles.helpRow}>
            <View style={styles.helpText}>
              <Text variant="label">Browse the help centre</Text>
              <Text variant="caption" tone="muted">
                Find guides and answers before contacting support.
              </Text>
            </View>
          </View>
        </Card>

        {/* Form */}
        <Card>
          <View style={styles.form}>
            <View>
              <Text variant="label" tone="secondary" style={styles.fieldLabel}>
                Category
              </Text>
              <Segmented options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
            </View>

            <Input
              label="Subject"
              value={subject}
              onChangeText={setSubject}
              placeholder="Brief summary of your question"
              maxLength={200}
              returnKeyType="next"
            />

            <Input
              label="Message"
              value={message}
              onChangeText={setMessage}
              placeholder="Describe your issue or question in detail…"
              multiline
              style={styles.messageInput}
              maxLength={5000}
            />
            <Text variant="caption" tone="muted" style={styles.charCount}>
              {message.length}/5000
            </Text>

            <Input
              label="Your email (optional)"
              value={contactEmail}
              onChangeText={setContactEmail}
              placeholder="Best address to reach you"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              helper="Helps us reply directly if it differs from your login email."
              maxLength={255}
            />

            <Input
              label="Phone number (optional)"
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="e.g. +44 7700 900000"
              keyboardType="phone-pad"
              maxLength={40}
            />

            <Button
              label="Send message"
              fullWidth
              loading={mutation.isPending}
              disabled={!subject.trim() || !message.trim()}
              onPress={() => void handleSubmit()}
            />
          </View>
        </Card>

        {/* Other contact methods */}
        <Card>
          <Text variant="label" style={styles.otherContactTitle}>
            Other ways to reach us
          </Text>
          <Text
            variant="bodySmall"
            tone="secondary"
            style={styles.emailLink}
            onPress={() => void Linking.openURL('mailto:support@resneo.com').catch(() => undefined)}>
            support@resneo.com
          </Text>
        </Card>

        <View style={styles.spacer} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.md,
  },
  fieldLabel: {
    marginBottom: spacing.sm,
  },
  form: {
    gap: spacing.md,
  },
  messageInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    textAlign: 'right',
    marginTop: -spacing.xs,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  helpText: {
    flex: 1,
    gap: 2,
  },
  otherContactTitle: {
    marginBottom: spacing.sm,
  },
  emailLink: {
    textDecorationLine: 'underline',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  successContent: {
    gap: spacing.md,
    alignItems: 'center',
  },
  successTitle: {
    textAlign: 'center',
  },
  successBody: {
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
});
