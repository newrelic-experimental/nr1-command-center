import React from 'react';
import { AutoSizer, nerdlet } from 'nr1';
import Alarms from './alarms';

// https://docs.newrelic.com/docs/new-relic-programmable-platform-introduction

export default class MspAlerts extends React.Component {

  componentDidMount(){
    nerdlet.setConfig({
      timePicker: false
    })
  }

  render() {
    return (
      <AutoSizer>
        {({ width, height }) => (
          <Alarms
            width={width}
            height={height}
          />
        )}
      </AutoSizer>
    );
  }
}
