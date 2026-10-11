import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceCard, ChoiceGroup, NumberedStep, SetupSection } from '@/components/pos/setup/parts';
import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { StripeBlock } from '@/components/pos/setup/StripeBlock';
import { TeamPhones } from '@/components/pos/setup/TeamPhones';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { cardsNeedInPerson, cardsUsePhone, cardsUseReader, type CardsAnswer } from '@/lib/pos/setup/answers';
import { setupT, type SetupCopyId } from '@/lib/pos/setup/copy';
import { SETUP_PHONE_HREF } from '@/lib/pos/setup/flow';
import { readersT } from '@/lib/pos/settings-more/readers-copy';
import { useRefreshPosBootstrap } from '@/lib/queries/usePosSetup';
import { useUpdateVenue } from '@/lib/queries/useVenueSettings';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';

/** Checkout settings' card readers screen, where a reader is paired with its code. */
export const CARD_READERS_HREF = '/checkout-settings/card-readers';

const CHOICES: { value: CardsAnswer; title: SetupCopyId; note: SetupCopyId | null }[] = [
  { value: 'phone', title: 'setup.cards.phone', note: 'setup.cards.phone.note' },
  { value: 'reader', title: 'setup.cards.reader', note: 'setup.cards.reader.note' },
  { value: 'both', title: 'setup.cards.both', note: null },
  { value: 'links', title: 'setup.cards.links', note: 'setup.cards.links.note' },
];

/**
 * W3, "How do you want to take cards?" (design 6.3, drawn as B4): only after Card was ticked. The
 * step that joins four places: Stripe (connected from here, through Stripe's own pages), the
 * in-person switch (set by choosing a phone or a reader, `PATCH /api/venue`), this phone ("Get
 * this phone ready") and the team's phones, ticked off live as each registers. A reader gets the
 * pairing steps and Checkout settings' card readers screen, where the code is typed.
 */
export function CardsStep({ data }: { data: SetupData }) {
  const router = useRouter();
  const runner = useStepRunner('cards', data);
  const updateVenue = useUpdateVenue();
  const refreshBootstrap = useRefreshPosBootstrap();
  const { venue } = useVenueContext();
  const [cards, setCards] = useState<CardsAnswer | null>(data.status.answers.cards ?? null);
  const [inPersonError, setInPersonError] = useState<string | null>(null);
  const inPersonOn = (venue ?? data.venue).in_person_payments_enabled === true;

  const turnOnInPerson = async (): Promise<string | null> => {
    if (inPersonOn) return null;
    try {
      await updateVenue.mutateAsync({ in_person_payments_enabled: true });
      // The till's card methods follow it, and so does this phone's report that it can take cards.
      void refreshBootstrap();
      setInPersonError(null);
      return null;
    } catch (e) {
      const message = e instanceof ApiError && e.status !== 0 && e.status < 500 ? e.message : setupT('app.setup.cards.inPersonFailed');
      setInPersonError(message);
      return message;
    }
  };

  const choose = (next: CardsAnswer) => {
    setCards(next);
    runner.setError(null);
    // The phones' list and Tap to Pay need it on now, not only after Continue.
    if (cardsNeedInPerson(next) && !inPersonOn && !updateVenue.isPending) void turnOnInPerson();
  };

  const onContinue = () => {
    if (!cards) return;
    void runner.proceed(async () => (cardsNeedInPerson(cards) ? turnOnInPerson() : null), { cards });
  };

  const phone = cardsUsePhone(cards);
  const reader = cardsUseReader(cards);

  return (
    <SetupFrame
      screen="cards"
      data={data}
      title={setupT('setup.cards.title')}
      footer={
        <SetupButtons
          onContinue={onContinue}
          onSkip={() => void runner.skip()}
          busy={runner.busy}
          continueDisabled={!cards}
          error={runner.error}
        />
      }>
      <SetupSection>
        <StripeBlock isAdmin />
      </SetupSection>

      <ChoiceGroup>
        {CHOICES.map((choice) => (
          <ChoiceCard
            key={choice.value}
            title={setupT(choice.title)}
            note={choice.note ? setupT(choice.note) : null}
            selected={cards === choice.value}
            onPress={() => choose(choice.value)}
            disabled={runner.busy !== null}
          />
        ))}
      </ChoiceGroup>
      {cardsNeedInPerson(cards) ? (
        <Text variant="bodySmall" tone="secondary">
          {setupT('setup.cards.inPerson')}
        </Text>
      ) : null}
      {inPersonError ? (
        <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
          {inPersonError}
        </Text>
      ) : null}

      {phone ? (
        <SetupSection title={setupT('setup.cards.phone.title')}>
          <View style={styles.stack}>
            <Text variant="bodySmall">{setupT('app.setup.cards.thisPhone')}</Text>
            <Button
              label={setupT('app.setup.cards.thisPhone.button')}
              variant="secondary"
              fullWidth
              onPress={() => router.push(SETUP_PHONE_HREF as Href)}
            />
          </View>
          <View style={styles.stack}>
            <Text variant="label">{setupT('app.setup.cards.team.title')}</Text>
            <Text variant="bodySmall" tone="secondary">
              {setupT('app.setup.cards.team.help')}
            </Text>
            <Text variant="bodySmall" tone="secondary">
              {setupT('setup.cards.phone.step2.iphone')} {setupT('setup.cards.phone.step2.android')}
            </Text>
            <TeamPhones status={data.status} poll={inPersonOn} />
          </View>
          <Text variant="caption" tone="muted">
            {setupT('setup.cards.phone.devices')}
          </Text>
        </SetupSection>
      ) : null}

      {reader ? (
        <SetupSection title={setupT('app.setup.cards.reader.title')}>
          <NumberedStep n={1}>{readersT('set.readers.step1')}</NumberedStep>
          <NumberedStep n={2}>{readersT('set.readers.step2')}</NumberedStep>
          <NumberedStep n={3}>{readersT('set.readers.step3')}</NumberedStep>
          <Button
            label={readersT('set.readers.add')}
            variant="secondary"
            fullWidth
            onPress={() => router.push(CARD_READERS_HREF as Href)}
          />
          <Text variant="caption" tone="muted">
            {readersT('set.readers.getOne')}
          </Text>
        </SetupSection>
      ) : null}
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
});
