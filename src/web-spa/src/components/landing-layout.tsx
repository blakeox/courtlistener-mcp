import React from 'react';
import { cn } from '../lib/cn';
import {
  landingButtonRowClass,
  landingContainerClass,
  landingCourthouseSilhouetteClass,
  landingFeatureGridClass,
  landingFooterBrandClass,
  landingFooterClass,
  landingFooterInnerClass,
  landingFooterLinksClass,
  landingHeaderClass,
  landingHeaderInnerClass,
  landingHeroBackdropClass,
  landingHeroClass,
  landingHeroCopyClass,
  landingHeroGridClass,
  landingHeroGridPatternClass,
  landingHeroNoteClass,
  landingHeroTextClass,
  landingHeroTitleClass,
  landingHeroVisualClass,
  landingMenuToggleClass,
  landingNavClassName,
  landingOpenSourceGridClass,
  landingOpenSourceSectionClass,
  landingOpenSourceStatsClass,
  landingPageClass,
  landingSectionClass,
  landingSectionLightClass,
  landingSetupLayoutClass,
  landingTrustCopyClass,
  landingTrustGridClass,
} from '../lib/landing-classes';

export function LandingPageRoot(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingPageClass, props.className)}>{props.children}</div>;
}

export function LandingContainer(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingContainerClass, props.className)}>{props.children}</div>;
}

export function LandingHeader(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <header className={cn(landingHeaderClass, props.className)}>{props.children}</header>;
}

export function LandingHeaderInner(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return (
    <LandingContainer className={cn(landingHeaderInnerClass, props.className)}>
      {props.children}
    </LandingContainer>
  );
}

export function LandingNav(
  props: React.PropsWithChildren<{
    open: boolean;
    id?: string;
    className?: string;
    'aria-label'?: string;
  }>,
): React.JSX.Element {
  return (
    <nav
      id={props.id}
      aria-label={props['aria-label']}
      className={landingNavClassName(props.open, props.className)}
    >
      {props.children}
    </nav>
  );
}

export function LandingMenuToggle(
  props: React.ComponentProps<'button'> & { className?: string },
): React.JSX.Element {
  const { className, ...buttonProps } = props;
  return (
    <button type="button" {...buttonProps} className={cn(landingMenuToggleClass, className)} />
  );
}

export function LandingHero(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return (
    <section className={cn(landingHeroClass, props.className)}>
      <div className={landingHeroBackdropClass} aria-hidden="true">
        <div className={landingHeroGridPatternClass} />
        <div className={landingCourthouseSilhouetteClass} />
      </div>
      {props.children}
    </section>
  );
}

export function LandingHeroGrid(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return (
    <LandingContainer className={cn(landingHeroGridClass, props.className)}>
      {props.children}
    </LandingContainer>
  );
}

export function LandingHeroCopy(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingHeroCopyClass, props.className)}>{props.children}</div>;
}

export function LandingHeroTitle(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <h1 className={cn(landingHeroTitleClass, props.className)}>{props.children}</h1>;
}

export function LandingHeroText(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <p className={cn(landingHeroTextClass, props.className)}>{props.children}</p>;
}

export function LandingButtonRow(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingButtonRowClass, props.className)}>{props.children}</div>;
}

export function LandingTrustCopy(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <p className={cn(landingTrustCopyClass, props.className)}>{props.children}</p>;
}

export function LandingHeroVisual(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingHeroVisualClass, props.className)}>{props.children}</div>;
}

export function LandingHeroNote(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingHeroNoteClass, props.className)}>{props.children}</div>;
}

export function LandingSection(
  props: React.PropsWithChildren<{
    tone?: 'default' | 'light' | 'open-source';
    id?: string;
    className?: string;
  }>,
): React.JSX.Element {
  const tone = props.tone ?? 'default';
  return (
    <section
      id={props.id}
      className={cn(
        tone === 'light' && landingSectionLightClass,
        tone === 'open-source' && landingOpenSourceSectionClass,
        tone === 'default' && landingSectionClass,
        props.className,
      )}
    >
      {props.children}
    </section>
  );
}

export function LandingFeatureGrid(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingFeatureGridClass, props.className)}>{props.children}</div>;
}

export function LandingTrustGrid(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingTrustGridClass, props.className)}>{props.children}</div>;
}

export function LandingSetupLayout(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingSetupLayoutClass, props.className)}>{props.children}</div>;
}

export function LandingOpenSourceGrid(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingOpenSourceGridClass, props.className)}>{props.children}</div>;
}

export function LandingOpenSourceStats(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingOpenSourceStatsClass, props.className)}>{props.children}</div>;
}

export function LandingFooter(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <footer className={cn(landingFooterClass, props.className)}>{props.children}</footer>;
}

export function LandingFooterInner(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return (
    <LandingContainer className={cn(landingFooterInnerClass, props.className)}>
      {props.children}
    </LandingContainer>
  );
}

export function LandingFooterBrand(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <span className={cn(landingFooterBrandClass, props.className)}>{props.children}</span>;
}

export function LandingFooterLinks(
  props: React.PropsWithChildren<{ className?: string }>,
): React.JSX.Element {
  return <div className={cn(landingFooterLinksClass, props.className)}>{props.children}</div>;
}
