import type * as React from 'react';
import {
  Container,
  EyebrowTag,
  HeroLine,
  HeroMeta,
  HeroSub,
  HeroTitle,
  Section,
} from '@/components/ui';
import LoginForm from './LoginForm';

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
              { label: 'FLOW', value: 'PASSKEY · WEBAUTHN' },
              { label: 'STATUS', value: 'OPERATIONAL' },
            ]}
          />
          <div className="grid grid-cols-12 gap-6 pb-12">
            <div className="col-span-12 lg:col-span-7 flex flex-col">
              <EyebrowTag dotTone="green" className="mb-7">
                LOG IN · RETURNING USERS
              </EyebrowTag>
              <HeroTitle>
                <HeroLine>Your identity lives</HeroLine>
                <HeroLine>in your device.</HeroLine>
              </HeroTitle>
              <HeroSub>
                Passkeys put the private key in your platform's secure hardware — Secure
                Enclave, TPM, or Android Keystore. The cloud sees only a public key + a
                signature. Your did:key principal identity stays the same.
              </HeroSub>
            </div>
            <div className="col-span-12 lg:col-span-5 flex flex-col">
              <LoginForm />
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
