import { SetupGate, type SetupData } from '@/components/pos/setup/SetupFrame';
import { CardsStep } from '@/components/pos/setup/steps/CardsStep';
import { DetailsStep } from '@/components/pos/setup/steps/DetailsStep';
import { DoneStep } from '@/components/pos/setup/steps/DoneStep';
import { LoyaltyStep } from '@/components/pos/setup/steps/LoyaltyStep';
import { PayStep } from '@/components/pos/setup/steps/PayStep';
import { PracticeStep } from '@/components/pos/setup/steps/PracticeStep';
import { ProductsStep } from '@/components/pos/setup/steps/ProductsStep';
import { ShopStep } from '@/components/pos/setup/steps/ShopStep';
import { TeamStep } from '@/components/pos/setup/steps/TeamStep';
import { TipsStep } from '@/components/pos/setup/steps/TipsStep';
import { UseStep } from '@/components/pos/setup/steps/UseStep';
import { VouchersStep } from '@/components/pos/setup/steps/VouchersStep';
import { WelcomeStep } from '@/components/pos/setup/steps/WelcomeStep';
import type { PosSetupScreen } from '@/types/pos-setup';
import type { PosSwitchExtraKey } from '@/types/pos-switches';

/**
 * The set-up wizard in the app (POS Part 4, owner decision OB2: the full wizard in the first
 * version), one native screen per step of the design's section 6.3, W0 to W12, pushed one after
 * another, so Back returns to the step before. Each screen asks one thing in the owner's words and
 * writes through the routes Checkout settings uses.
 */
export function SetupWizardScreen({ screen, missed }: { screen: PosSetupScreen; missed: readonly PosSwitchExtraKey[] }) {
  return <SetupGate>{(data) => <SetupStep screen={screen} data={data} missed={missed} />}</SetupGate>;
}

function SetupStep({ screen, data, missed }: { screen: PosSetupScreen; data: SetupData; missed: readonly PosSwitchExtraKey[] }) {
  switch (screen) {
    case 'welcome':
      return <WelcomeStep data={data} missed={missed} />;
    case 'use':
      return <UseStep data={data} />;
    case 'pay':
      return <PayStep data={data} />;
    case 'cards':
      return <CardsStep data={data} />;
    case 'tips':
      return <TipsStep data={data} />;
    case 'details':
      return <DetailsStep data={data} />;
    case 'team':
      return <TeamStep data={data} />;
    case 'products':
      return <ProductsStep data={data} />;
    case 'vouchers':
      return <VouchersStep data={data} />;
    case 'loyalty':
      return <LoyaltyStep data={data} />;
    case 'shop':
      return <ShopStep data={data} />;
    case 'practice':
      return <PracticeStep data={data} />;
    case 'done':
      return <DoneStep data={data} />;
  }
}
