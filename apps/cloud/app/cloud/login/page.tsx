import type * as React from 'react';
import {
  ButtonLink,
  Container,
  EyebrowTag,
  HeroCTA,
  HeroLine,
  HeroMeta,
  HeroSub,
  HeroTitle,
  Section,
} from '@/components/ui';

export const metadata = {
  title: 'Log in · ARP Cloud',
};

export default function LoginPage(): React.JSX.Element {
  return (
    <>
      <Section tone="paper" spacing="hero" rule={false} as="header">
        <Container>
          <HeroMeta
            cells={[
              { label: 'PLATE', value: 'P.00 / LOGIN' },
              { label: 'IDENTITY', value: 'BROWSER-HELD' },
              { label: 'FLOW', value: '[TBD] WEBAUTHN' },
              { label: 'STATUS', value: 'OPERATIONAL' },
            ]}
          />
          <div className="grid grid-cols-12 gap-6 pb-12">
            <div className="col-span-12 lg:col-span-8 flex flex-col">
              <EyebrowTag dotTone="yellow" className="mb-7">
                LOG IN · RETURNING USERS
              </EyebrowTag>
              <HeroTitle>
                <HeroLine>Your identity lives</HeroLine>
                <HeroLine>in your browser.</HeroLine>
              </HeroTitle>
              <HeroSub>
                Phase 8.5 shift: onboarding already mints a browser-held key and creates your
                tenant on the dashboard. There is no separate login for now — returning users
                land on the dashboard once their browser is recognised. [TBD — passkey sign-in at
                Phase 9.]
              </HeroSub>
              <HeroCTA>
                <ButtonLink href="/dashboard" variant="primary" size="lg" arrow="up-right">
                  Go to dashboard
                </ButtonLink>
                <ButtonLink href="/onboarding" variant="default" size="lg" arrow>
                  New here? Sign up
                </ButtonLink>
              </HeroCTA>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
