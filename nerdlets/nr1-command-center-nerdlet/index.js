import React from 'react';
import { PlatformStateContext, NerdletStateContext, AutoSizer } from 'nr1';
import Alarms from './alarms';

// https://docs.newrelic.com/docs/new-relic-programmable-platform-introduction

export default class MspAlerts extends React.Component {
    render() {
      return (
        <PlatformStateContext.Consumer>
          {launcherUrlState => (
            <NerdletStateContext.Consumer>
              {nerdletUrlState => (
                <AutoSizer>
                  {({ width, height }) => (
                    <Alarms
                      launcherUrlState={launcherUrlState}
                      nerdletUrlState={nerdletUrlState}
                      width={width}
                      height={height}
                    />
                  )}
                </AutoSizer>
              )}
            </NerdletStateContext.Consumer>
          )}
        </PlatformStateContext.Consumer>
      );
    }
}
