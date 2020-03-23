import React, { Component, PureComponent } from 'react';
import PropTypes from 'prop-types';
import { Icon} from 'nr1';


export default class ToolPanel extends Component {
    static propTypes = {

       }

    constructor(props) {
        super(props);
        this.state = {showTools: false, currentData:JSON.stringify(this.props.currentData)}
        this.saveData=this.saveData.bind(this)
    }

    componentDidUpdate(prevProps) {
        if (prevProps.currentData!=this.props.currentData) { // We only get more data if the proptype has changed
           this.setState({currentData:JSON.stringify(this.props.currentData)})
        }
    }

    saveData() {
        this.props.saveHandler(this.state.currentData)
    }

    render() {
        //get props, including nested props
        const { previousData, storageCollectionId,documentId } = this.props;
        const { showTools, currentData } = this.state;

        let toolsPanel
        if(showTools) {
            toolsPanel=<div className='toolsPanel'>
                {/* <div><strong>Storage location:</strong><br /><span>{storageCollectionId}/{documentId}-chunk-nnn</span></div>
        <div><strong>Storage size:</strong><br /><span>{Buffer.byteLength(JSON.stringify(currentData), 'utf8')}</span></div> */}
                <h3>Originally Loaded Data</h3>
        <textarea className='u-unstyledInput previousTextArea' readOnly={true} defaultValue={currentData}></textarea>

                <h3>Current Data (you can change this)</h3>
        <textarea className='u-unstyledInput currentTextArea' onChange={(e)=>{this.setState({currentData: event.target.value});}} value={currentData}></textarea>
                <br /><br /><button className="btn btn-info u-unstyledButton" onClick={this.saveData}><Icon spacingType={[Icon.SPACING_TYPE.SMALL]} type={Icon.TYPE.HARDWARE_AND_SOFTWARE__SOFTWARE__UPSTREAM_CONNECTION} inline ></Icon>Save</button>
                </div>
        }

      return <div>
         <button className="btn btn-primary btn-sm u-unstyledButton" onClick={()=>{this.setState({showTools: !showTools})}}>
          <Icon spacingType={[Icon.SPACING_TYPE.SMALL]} type={Icon.TYPE.INTERFACE__OPERATIONS__CONFIGURE} inline ></Icon>Tools
         </button>
          {toolsPanel}
        </div>

    }
}
