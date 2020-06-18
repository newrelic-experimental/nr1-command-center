import React from 'react';
import PropTypes from 'prop-types';
import ReactTable from 'react-table';
import Configurator from "./components/Configurator"
import { AccountStorageMutation, AccountStorageQuery, Button, HeadingText, Spinner, Tabs, TabsItem, Card, CardHeader, Modal, TextField, Toast, Dropdown, DropdownItem, Tooltip, UserQuery, Icon} from 'nr1';
import moment from 'moment';

export default class Alarms extends React.Component {
  static propTypes = {
    width: PropTypes.number,
    height: PropTypes.number,
  };

  constructor(props) {
    super(props);
    this.state = {
      accountSummaryData: null,
      tableData: [],
      filteredData: [],
      cardData: null,
      refreshingData: false,
      modalHidden: true,
      linkText: "",
      displayText: "",
      rowAccountId: null,
      rowViolationId: null,
      ackInc: null,
      ackUser: null,
      ackIncidentGroup: [],
      ackHidden: true,
      adminKey: "",
      config: false,
      currentTime: null,
      sortDisplay: "Sort by",
      searchInput: ""
    }

    this.accountId = <your_account_id>; //insert your account ID (preferably a master account)

    this.schema = {
      "type": "object",
      "properties": {
        "accounts": {
          "type": "array",
          "title": "Accounts",
          "items": {
            "required": [ "name", "value", "id"],
            "properties": {
              "name": {
                "type": "string",
                "title": "Account Name"
              },
              "value": {
                "type": "string",
                "title": "API Key"
              },
              "id": {
                "type": "number",
                "title": "Account ID"
              }
            }
          }
        }
      }
    }

    this.uischema = {
      "accounts": {
        "items": {
          "value": {
            "ui:widget": "password"
          }
        }
      }
    }

    this._onClose = this._onClose.bind(this);
    this._onAckClose = this._onAckClose.bind(this);
    this.handleSort = this.handleSort.bind(this);
  }

  async componentDidMount(){
    this.refreshingData();
    this.interval = setInterval(() => this.refreshingData(), 120000); // DEFAULT REFRESH RATE - 2 minutes
  }

  componentWillUnmount(){
    clearInterval(this.interval);
  }

  getNextUrl(link) {
    if (link == null) return null;

    let paramList = link.split(',');
    for (var i=0; i < paramList.length; i++) {
      let param = paramList[i].split(';');
      if (param[1].indexOf('next') > 0) {
        let uri = param[0].replace('<', '').replace('>', '').trim();
        return uri;
      }
    }
    return null;
  }

  async getData(api_uri, account, allData) {
    //initial api call
    let resp = await fetch(api_uri, {method: 'get', headers: {'X-Api-Key': account.value}})
    if (resp.status != 200) {
      console.debug("Error retrieving data for account " + account.name + "." + " Status: " + resp.statusText);
      Toast.showToast({
        title: "Data Retrieval Error - Account: " + account.name,
        description: "Received status: " + resp.statusText + ". Please validate API Key / Account ID inputs.",
        sticky: true,
        type: Toast.TYPE.CRITICAL
      })
    }
    let respJson = await resp.json();
    allData = await allData.concat(respJson.violations);
    var link = resp.headers.get('link');
    if (link){ //if link exists, iterate pages
      if (link.includes("next")) { //check for another page to iterate
        api_uri = this.getNextUrl(link); //parse out next page from header
        let p = await this.getData(api_uri, account, allData); //recursive call to fetch next page
        return p
      } else {
        return allData //return paginated array of objects
      }
    } else {
      return allData //otherwise return response (no pagination required)
    }
  }

  removeOldLinks(linksFromNerdStore){
    let loadedData = this.state.tableData;

    linksFromNerdStore.forEach(lnk =>{
      var index = loadedData.findIndex(v => v.id == Number(lnk.id));
      if (index === -1) {
        this.deleteLinkFromNerdStore(lnk.id)
      } else {
        //do nothing
      }
    })
  }

  checkDomain() {
    let oneDomain = window.location.ancestorOrigins[0]
    if (oneDomain.includes("eu")) {
      return 'https://api.eu.newrelic.com/v2/alerts_violations.json?only_open=true';
    } else {
      return 'https://api.newrelic.com/v2/alerts_violations.json?only_open=true';
    }
  }

  async populateAllData(loadedLinks, loadedAcks){
    let sumData = [];
    let tableData = [];

    let cardData = [];
    let totalCount = 0;
    let criticalCount = 0;
    let warningCount = 0;
    let avgOpenDuration = 0;
    let totalDuration = 0;

    let megaData = {};

    let apiUri = this.checkDomain()

    for (let account of this.state.config.accounts){ //loop through each account
      let acctCrits = 0;
      let acctWarns = 0;
      let acctIncs = [];
      let allData = [];
      let r = await this.getData(apiUri, account, allData)

      if (r.includes(undefined)) {
        //do nothing
      } else {
        totalCount += r.length;

        for (var k=0; k < r.length; k++){ //loop through each violation
          totalDuration += r[k].duration
          let formattedDuration = this.secondsToHms(r[k].duration);
          let openedAt = this.convertUnixTimestamp(r[k].opened_at);
          let noteDisplay = null;
          let noteLink = null;
          let ackUsr = null;
          let incId = null;

          if (r[k].priority == "Critical") {
            criticalCount += 1;
            acctCrits += 1;
          }

          if (r[k].priority == "Warning") {
            warningCount += 1;
            acctWarns +=1;
          }

          if (r[k].links.incident_id){
            incId = r[k].links.incident_id;
            acctIncs.push(incId);
          }

          //check if violation id returned matches returned ID from nerdstore, add it to table payload if true
          for (var p=0; p < loadedLinks.length; p++){
            if (r[k].id == Number(loadedLinks[p].id)) {
              noteDisplay = loadedLinks[p].document.displayText;
              noteLink = loadedLinks[p].document.linkText;
              break;
            }
          }

          //check if violation id returned mathces returned ID from nerdstore (for acks)
          for (var kp=0; kp < loadedAcks.length; kp++){
            if (r[k].id == Number(loadedAcks[kp].id)) {
              ackUsr = loadedAcks[kp].document.userName;
              break;
            }
          }

          //data object for all accounts open violations
          tableData.push({
            "company_name": account.name,
            "condition_name": r[k].condition_name,
            "policy_name": r[k].policy_name,
            "duration": formattedDuration,
            "product": r[k].entity.product,
            "id": r[k].id,
            "label": r[k].label,
            "entity": r[k].entity.name,
            "ackUser": ackUsr,
            "links": {
              "id": r[k].id,
              "incident_id": incId,
              "condition_id": r[k].links.condition_id,
              "account_id": account.id,
              "policy_id":r[k].links.policy_id
            },
            "note": {
              "display": noteDisplay,
              "linkText": noteLink
            },
            "opened_at": openedAt,
            "priority": r[k].priority
          })
        }

        const distinct = (value, index, self) => {
          return self.indexOf(value) === index;
        }
        const uniqueIncidents = acctIncs.filter(distinct);

        sumData.push({"accountName": account.name, "accountId": account.id, "allViolations": r.length, "crits": acctCrits, "warns": acctWarns, "incidents": uniqueIncidents.length }) //data object for summary data
      } //else

    }//for

    avgOpenDuration = totalDuration / totalCount;
    let formattedAvgDuration = this.secondsToHms(avgOpenDuration);

    cardData.push({
      "totalAlertCount": totalCount,
      "totalCriticalCount": criticalCount,
      "totalWarningCount": warningCount,
      "avgOpenDuration": formattedAvgDuration
    })

    //all data to be inserted into states
    megaData = {
      "cardData": cardData,
      "sumData": sumData,
      "tabData": tableData
    };

    return megaData
  }

  secondsToHms(sec){
    var seconds = parseInt(sec, 10);

    var days = Math.floor(seconds / (3600*24));
    if (days <= 9){
      days = "0" + days;
    }
    seconds  -= days*3600*24;
    var hrs   = Math.floor(seconds / 3600);
    if (hrs <= 9){
      hrs = "0" + hrs;
    }
    seconds  -= hrs*3600;
    var mnts = Math.floor(seconds / 60);
    if (mnts <= 9){
      mnts = "0" + mnts;
    }
    seconds  -= mnts*60;
    if (seconds <= 9) {
      seconds = "0" + seconds;
    }

    return days+":"+hrs+":"+mnts+":"+seconds;
  }

  convertUnixTimestamp(t){
    var newDate = moment(new Date(t)).format('MM/DD/YYYY hh:MM');
    return newDate;
  }

  openLinkModal(props){
    this.setState({
      modalHidden: false,
      rowAccountId: props.original.links.account_id,
      rowViolationId: props.original.id
    });
  }

  _onClose(e) {
    this.setState({
      modalHidden: true,
      displayText: "",
      linkText: ""
    });
  }

  _onAckClose(e){
    this.setState({
      ackHidden: true,
      adminKey: null
    })
  }

  updateLinkCell(d, l, vKey) {
    const currentIndex = this.state.tableData.findIndex(vio => vio.id === vKey),
          tableCopy = [...this.state.tableData];
    tableCopy[currentIndex].note.display = d;
    tableCopy[currentIndex].note.linkText = l;
  }

  async saveLinkToNerdStore(){
    let display = this.state.displayText;
    let link = this.state.linkText;
    let docKey = this.state.rowViolationId.toString();

    let hasErrors = await this.validateLinkInput(display, link)

    if (hasErrors) {
      Toast.showToast({title: "Text Validation Error! Please Check Input.", type: Toast.TYPE.CRITICAL})
    } else {
      this.updateLinkCell(display, link, Number(docKey)); //live update (alleviates having to refresh to pull from nerdstore)
      this.setState({
        modalHidden: true,
      }, () => {
        AccountStorageMutation.mutate({
          accountId: this.accountId,
          actionType: AccountStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
          collection: 'IncidentsLinks',
          documentId: docKey,
          document: {
            displayText: display,
            linkText: link
          }
        }).then((data) => {
          Toast.showToast({title: "Incident Link Saved!", type: Toast.TYPE.Normal });
          this.resetFormFields();
        }).catch(error => {
          console.log(error);
          Toast.showToast({title: error.message, type: Toast.TYPE.CRITICAL });
        })
      });
    }
  }

  resetFormFields(){
    this.setState({
      displayText: "",
      linkText: ""
    })
  }

  async loadLinksFromNerdStore(){
    let allLinks = [];
    AccountStorageQuery.query({
      accountId: this.accountId,
      collection: 'IncidentsLinks',
      fetchPolicyType: AccountStorageQuery.FETCH_POLICY_TYPE.CACHE_FIRST
    }).then(({ data }) => { //add brackets ({data}) for just data, remove them for seeing errors
      if (data.length > 0) {
        for (var z=0; z < data.length; z++){
          allLinks.push(data[z])
        }
      }
    }).catch(error => {
      console.log(error);
    })

    return allLinks;
  }

  deleteLinkFromNerdStore(docId){
    AccountStorageMutation.mutate({
      accountId: this.accountId,
      actionType: AccountStorageMutation.ACTION_TYPE.DELETE_DOCUMENT,
      collection: "IncidentsLinks",
      documentId: docId
    })
  }

  validateLinkInput(disT, linkT) {
    let errors = false;

    if (disT == null || disT == undefined || disT == ""){
      errors = true;
    }

    if (linkT == null || linkT == undefined || linkT == ""){
      errors = true;
    }

    return errors;
  }

  renderTableData(){
    const columns = [
      {
        Header: () =><strong>ID</strong>,
        accessor: 'id',
	      width: 75
      },
      {
        Header: () => <strong>Account</strong>,
        accessor: 'company_name',
	      width: 150,
      },
      {
        Header: () => <strong>Description</strong>,
        accessor: 'label',
        width: 300
      },
      {
        Header: () => <strong>Entity</strong>,
        accessor: 'entity',
        width: 180
      },
      {
        Header: () => <strong>Product</strong>,
        accessor: 'product',
	      width: 100
      },
      {
        Header: () => <Tooltip text="days:hours:minutes:seconds"><strong>Duration</strong></Tooltip>,
        accessor: 'duration',
        width: 85,
        sortMethod: (a, b) => {
          let aa = a.split(":");
          let bb = b.split(":");

          let aTime = moment.duration(aa[0] + "." + aa[1] + ":" + aa[2] + ":" + aa[3])
          let bTime = moment.duration(bb[0] + "." + bb[1] + ":" + bb[2] + ":" + bb[3])

          return aTime - bTime;
        }
      },
      {
        Header:() => <strong>Policy Name</strong>,
        accessor: 'policy_name',
        width: 190
      },
      {
        Header:() => <strong>Condition Name</strong>,
        accessor: 'condition_name',
	      width: 240
      },
      {
        Header:() => <strong>Priority</strong>,
        accessor: 'priority',
	      width: 60,
        getProps: (state, rowInfo, column) => {
            return {
                style: {
                    color: rowInfo && rowInfo.row.priority === 'Critical' ? 'red' : null,
                },
            };
        },
      },
      {
        Header: () => <strong>Opened At</strong>,
        accessor: 'opened_at',
	      width: 110,
        sortMethod: (a, b) => {
          return moment(b) - moment(a)
        }
      },
      {
        Header:() => <strong>Incident</strong>,
        accessor: 'links.incident_id',
	      width: 90,
        Cell: props => (<a href={`https://alerts.newrelic.com/accounts/${props.original.links.account_id}/incidents/${props.value}/violations?id=${props.original.id}`} target="_blank">{props.value}</a>)
      },
      {
        Header: () => <strong>Ack</strong>,
        id: 'ack',
        accessor: row => row.ackUser,
        width: 60,
        Cell: props => {
          if (props.original.ackUser !== null){
            var initials = props.original.ackUser.match(/\b\w/g) || [];
            initials = ((initials.shift() || '') + (initials.pop() || '')).toUpperCase();
            return (
              <div style={{"textAlign": "center"}}>
                <Tooltip text={props.original.ackUser}><Button style={{"backgroundColor": "black"}} type={Button.TYPE.PRIMARY}><strong>{initials}</strong></Button></Tooltip>
              </div>
            )
          } else {
            return (
              <div style={{"textAlign": "center"}}>
                <Button type={Button.TYPE.PRIMARY} iconType={Button.ICON_TYPE.INTERFACE__OPERATIONS__FOLLOW} onClick={() => this.openAckPopup(props)}>{props.original.ackUser}</Button>
              </div>
            )
          }
        },
        sortMethod: (a, b, desc) => {
          if (!desc) {
            return !a ? 1 : (!b ? -1 : (a.localeCompare(b)))
          }
          else {
            return !a ? -1 : (!b ? 1 : (a.localeCompare(b)))
          }
        }
      },
      {
        Header:() => <strong>Links</strong>,
        id: 'notes',
        accessor: row => row.note.display,
        width: 200,
        Cell: props => {
            return (
              <div>
                <Button type={Button.TYPE.PRIMARY} iconType={Button.ICON_TYPE.DOCUMENTS__DOCUMENTS__NOTES__A_EDIT} onClick={() => this.openLinkModal(props)}></Button>
                <a className="notesLink" href={props.original.note.linkText} target="_blank">{props.original.note.display}</a>
              </div>
            )
          },
        sortMethod: (a, b, desc) => {
          if (!desc) {
            return !a ? 1 : (!b ? -1 : (a.localeCompare(b)))
          }
          else {
            return !a ? -1 : (!b ? 1 : (a.localeCompare(b)))
          }
        }
      }
    ];

    return (
      <div>
        <TextField
          type={TextField.TYPE.SEARCH}
          value={this.state.searchInput || ""}
          placeholder="Search..."
          className="table-search"
          onChange={() => this.handleSearchChange(event)}
        ></TextField>
        <Card className="openCards">
          <CardHeader title="Total" subtitle={this.state.cardData[0].totalAlertCount.toString()} />
        </Card>
        <Card className="openCards">
          <CardHeader title="Critical" subtitle={this.state.cardData[0].totalCriticalCount.toString()} />
        </Card>
        <Card className="openCards">
          <CardHeader title="Warning" subtitle={this.state.cardData[0].totalWarningCount.toString()} />
        </Card>
        <Card className="openCards">
          <CardHeader title="Avg Time Open" subtitle={this.state.cardData[0].avgOpenDuration.toString()} />
        </Card>
        <ReactTable
          className="detailTable"
          data={this.state.filteredData && this.state.filteredData.length ? this.state.filteredData: this.state.tableData}
          columns={columns}
        />
      </div>
    )
  }

  handleSearchChange(e) {
    this.setState({
      searchInput: e.target.value
    }, () => {
      this.globalSearch();
    })
  }

  globalSearch() {
    let { searchInput, tableData } = this.state;
    let filteredData = tableData.filter(row => {
      if (row.links.incident_id && row.links.incident_id !== undefined || row.links.incident_id !== null){
        return (
          row.company_name.toLowerCase().includes(searchInput.toLowerCase()) ||
          row.label.toLowerCase().includes(searchInput.toLowerCase()) ||
          row.entity.toLowerCase().includes(searchInput.toLowerCase()) ||
          row.policy_name.toLowerCase().includes(searchInput.toLowerCase()) ||
          row.condition_name.toLowerCase().includes(searchInput.toLowerCase()) ||
          row.priority.toLowerCase().includes(searchInput.toLowerCase()) ||
          row.links.incident_id.toString().includes(searchInput.toLowerCase())
        );
      } else {
        return (
          row.company_name.toLowerCase().includes(searchInput.toLowerCase()) ||
          row.label.toLowerCase().includes(searchInput.toLowerCase()) ||
          row.entity.toLowerCase().includes(searchInput.toLowerCase()) ||
          row.policy_name.toLowerCase().includes(searchInput.toLowerCase()) ||
          row.priority.toLowerCase().includes(searchInput.toLowerCase()) ||
          row.condition_name.toLowerCase().includes(searchInput.toLowerCase())
        );
      }
    })
    this.setState({ filteredData });
  }

  async getCurrentUser(){
    let data = await UserQuery.query();
    return data.data.name;
  }

  setTempAcks(inc){
    let incGroup = [];
    //get all IDs for matching incidents (1 inc -> many violations)
    for (var k=0; k < this.state.tableData.length; k++) {
      if (inc == this.state.tableData[k].links.incident_id){
        incGroup.push(this.state.tableData[k].id); //push unique violation IDs so we know where to insert ack'd user from Nerdstore
      }
    }
    return incGroup;
  }

  updateAckCell(user, vioKey) {
    const currentIndex = this.state.tableData.findIndex(vio => vio.id === vioKey),
          tableCopy = [...this.state.tableData];
    tableCopy[currentIndex].ackUser = user;
  }

  openAckPopup(props){
    this.setState({
      ackHidden: false,
      ackInc: props.original.links.incident_id,
    })
  }

  async ackIncident(){
    let {ackInc} = this.state;

    let currUser = await this.getCurrentUser(); //get current user making the ack
    let violationsToUpdate = await this.setTempAcks(ackInc); //get all violation IDs (rows) to update with ack user

    let r = await this.triggerWebhook(ackInc)

    if (r.status == 200){
      //loop to update corresponding cells
      for (var o=0; o < violationsToUpdate.length; o++){
        let vioToUpdate = violationsToUpdate[o]
        this.saveAckToNerdstore(currUser, vioToUpdate);
        this.updateAckCell(currUser, vioToUpdate);
      }
      this.setState({
        ackHidden: true,
        adminKey: ""
      }, () => {
        Toast.showToast({title: "Incident Acknowledged!", type: Toast.TYPE.Normal });
      })
    } else {
      Toast.showToast({title: "Failed to acknowledge incident. Response: " + r.status.toString() + "," + r.statusText, type: Toast.TYPE.CRITICAL});
      this.setState({
        adminKey: ""
      })
    }
  }

  async triggerWebhook(inc){
    const { adminKey } = this.state;
    const endpoint = 'https://api.newrelic.com/v2/alerts_incidents/' + inc + '/acknowledge.json';


    if (adminKey == null || adminKey == undefined || adminKey == "") {
      Toast.showToast({title: "Text Validation Error! Please Check Input.", type: Toast.TYPE.CRITICAL})
    } else {
      let resp = await fetch(endpoint, {method: 'put', headers: {'X-Api-Key': adminKey }}); //Note: Admin API Key required for PUTs

      return resp;
    }
  }

  saveAckToNerdstore(usr, aInc){
    AccountStorageMutation.mutate({
      accountId: this.accountId,
      actionType: AccountStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
      collection: 'Acknowledgements',
      documentId: aInc.toString(),
      document: {
        userName: usr
      }
    }).then((data) => {
    }).catch(error => {
      console.debug(error);
      Toast.showToast({title: error.message, type: Toast.TYPE.CRITICAL });
    })
  }

  async loadAcksFromNerdstore(){
    let allAcks = [];
    AccountStorageQuery.query({
      accountId: this.accountId,
      collection: 'Acknowledgements',
      fetchPolicyType: AccountStorageQuery.FETCH_POLICY_TYPE.CACHE_FIRST
    }).then(({ data }) => {
      if (data.length > 0) {
        for (var ackCount = 0; ackCount < data.length; ackCount++){
          allAcks.push(data[ackCount])
        }
      }
    }).catch(error => {
      console.log(error)
    })

    return allAcks;
  }

  removeOldAcks(acksFromNerdStore){
    let loadedData = this.state.tableData;

    acksFromNerdStore.forEach(ack =>{
      var ackIndex = loadedData.findIndex(v => v.id == Number(ack.id));
      if (ackIndex === -1) {
        this.deleteAckFromNerdstore(ack.id)
      } else {
        //do nothing
      }
    })
  }

  deleteAckFromNerdstore(ackId){
    AccountStorageMutation.mutate({
      accountId: this.accountId,
      actionType: AccountStorageMutation.ACTION_TYPE.DELETE_DOCUMENT,
      collection: 'Acknowledgements',
      documentId: ackId
    })
  }

  getIconStyle(acct){
    if (acct.crits >= 1 || acct.incidents >= 1) {
      return Button.ICON_TYPE.HARDWARE_AND_SOFTWARE__SOFTWARE__SERVICE__S_ERROR
    }

    if (acct.warns >= 1 && acct.crits == 0 && acct.incidents == 0) {
      return Button.ICON_TYPE.INTERFACE__STATE__WARNING;
    }

    if (acct.warns == 0 && acct.crits == 0 && acct.incidents == 0) {
      return Button.ICON_TYPE.INTERFACE__STATE__HEALTHY;
    }
  }

  getClassStyle(acct){
    if (acct.crits >= 1 || acct.incidents >= 1) {
      return "critical";
    }

    if (acct.warns >= 1 && acct.crits == 0 && acct.incidents == 0) {
      return "warning";
    }

    if (acct.warns == 0 && acct.crits == 0 && acct.incidents == 0) {
      return "healthy";
    }
  }

  refreshingData() {
    var currTime = new moment().format("LT");
    this.setState({
      refreshingData: true,
      currentTime: currTime
    }, () => {
      this.refreshAccounts();
    })
  }

  updateData(data) {
    this.setState({config: data, refreshingData: true}, () => {
      this.refreshAccounts();
    })
  }

  async refreshAccounts(){
    let l = await this.loadLinksFromNerdStore();
    let a = await this.loadAcksFromNerdstore();

    this.populateAllData(l, a).then(acctData => {
      this.setState({
        refreshingData: false,
        accountSummaryData: acctData.sumData,
        tableData: acctData.tabData,
        cardData: acctData.cardData
      }, () => {
        this.removeOldLinks(l);
        this.removeOldAcks(a);
      })
    })
  }

  navigateToIncident(aid){
    const url = "https://alerts.newrelic.com/accounts/" + aid + "/incidents";
    window.open(url, '_blank');
  }

  handleSort(e){
    let summarySorted = this.state.accountSummaryData;
    let configSorted = this.state.config;

    if (e.target.textContent == "A-Z"){
      summarySorted.sort(function(a, b){
        let accountAscA = a.accountName.toLowerCase();
        let accountAscB = b.accountName.toLowerCase();

        if (accountAscA < accountAscB){
          return -1;
        }

        if (accountAscA > accountAscB){
          return 1;
        }

        return 0;
      });

      configSorted.accounts.sort(function(a, b){
        if (a.name.toLowerCase() < b.name.toLowerCase()) {
          return -1;
        }

        if (a.name.toLowerCase() > b.name.toLowerCase()) {
          return 1;
        }
        return 0;
      })

      this.setState({
        accountSummaryData: summarySorted,
        config: configSorted,
        sortDisplay: e.target.textContent
      })
    }

    if (e.target.textContent == "Z-A") {
      summarySorted.sort(function(a, b){
        let accountDescA = a.accountName.toLowerCase();
        let accountDescB = b.accountName.toLowerCase();

        if (accountDescA < accountDescB){
          return 1;
        }

        if (accountDescA > accountDescB){
          return -1;
        }

        return 0;
      });

      configSorted.accounts.sort(function(a, b){
        if (a.name.toLowerCase() < b.name.toLowerCase()) {
          return 1;
        }

        if (a.name.toLowerCase() > b.name.toLowerCase()) {
          return -1;
        }
        return 0;
      })

      this.setState({
        accountSummaryData: summarySorted,
        config: configSorted,
        sortDisplay: e.target.textContent
      })
    }

    if (e.target.textContent == 'Critical' || e.target.textContent == 'Warning' || e.target.textContent == 'Healthy') {
      this.sortByStatus(e.target.textContent);
    }
  }

  sortByStatus(statusText) {
    let sortedByStatus = [];
    let statusToLower = statusText.toLowerCase();

    //first loops to push desired states to top
    for (let acct of this.state.accountSummaryData) {
      let status = this.getClassStyle(acct);
      if (status == statusToLower){
        sortedByStatus.push(acct);
      }
    }

    //second loop to push the rest
    for (let acct of this.state.accountSummaryData) {
      let status = this.getClassStyle(acct);
      if (status != statusToLower){
        sortedByStatus.push(acct);
      }
    }

    this.setState({
      accountSummaryData: sortedByStatus,
      sortDisplay: statusText
    }, () => {
      this.replicateToConfig();
    })

  }

  replicateToConfig(){
    let sortedConfig = {"accounts":[]}

    this.state.accountSummaryData.forEach(acct => sortedConfig.accounts.push(this.state.config.accounts.find(z => z.name == acct.accountName)));

    this.setState({
      config: sortedConfig
    })
  }

  render() {
    const { accountSummaryData, tableData, cardData, config, refreshingData, linkText, displayText, adminKey, ackInc, currentTime, sortDisplay } = this.state;

    const sortItems = ['A-Z', 'Z-A', 'Critical', 'Warning', 'Healthy'];

    let render = <Spinner />

    if (!accountSummaryData || !tableData || !cardData && refreshingData) {
      render =
        <div className="loading">
          <HeadingText>Refreshing Account Data...</HeadingText>
          <Spinner />
        </div>
    }

      let start =
      <div>
        <Icon style={{marginLeft: "60px", marginTop: "5px"}} className="start" type={Icon.TYPE.INTERFACE__ARROW__ARROW_TOP__V_ALTERNATE}/>
        <HeadingText style={{marginLeft: "25px", marginTop: "0"}}>Start Here</HeadingText>
      </div>

    if (config && accountSummaryData && tableData && cardData){
      render =
        <div>
          <span className="refreshLabel">Last Refreshed: <strong>{currentTime}</strong></span>
          <Tabs defaultValue="Home">
            <TabsItem value="Home" label={"Summary (" + accountSummaryData.length + ")"}>
              {accountSummaryData.map(acct =>
                <Button
                  key={acct.accountName}
                  id="acct"
                  iconType={this.getIconStyle(acct)}
                  className={this.getClassStyle(acct)}
                  onClick={() => {this.navigateToIncident(acct.accountId)}}
                >{acct.accountName}
                <br />
                <label style={{"paddingTop": "10px"}} className="acctLabel" htmlFor="acct"> Critical Violations - <strong>{acct.crits}</strong> </label>
                <label className="acctLabel" htmlFor="acct"> Warning Violations - <strong>{acct.warns}</strong> </label>
                <label className="acctLabel" htmlFor="acct"> Unique Incidents - <strong>{acct.incidents}</strong> </label>
                </Button>
              )}
              <div className="sortBy">
                <Dropdown type={Dropdown.TYPE.PRIMARY} title={this.state.sortDisplay} iconType={Dropdown.ICON_TYPE.INTERFACE__ARROW__SORT} items={sortItems}>
                  {({ item, index }) => (
                    <DropdownItem key={index} onClick={(e) => this.handleSort(e)}>
                      {item}
                    </DropdownItem>
                  )}
                </Dropdown>
              </div>
            </TabsItem>
            <TabsItem value="openViolations" label="Open Violations">
              {this.renderTableData()}
              <Modal hidden={this.state.modalHidden} onClose={() => this._onClose()}>
                <HeadingText><strong>Edit Link</strong></HeadingText>
                <TextField value={displayText || ""} onChange={(e) => this.setState({displayText: e.target.value})} label="Text to Display"/>
                <TextField value={linkText || ""} onChange={(e) => this.setState({linkText: e.target.value})} label="Link To"/>
                <Button type={Button.TYPE.PRIMARY} className="modalBtn" onClick={() => this.saveLinkToNerdStore()}>Save</Button>
                <Button type={Button.TYPE.DESTRUCTIVE} className="modalBtn" onClick={this._onClose}>Close</Button>
              </Modal>
              <Modal hidden={this.state.ackHidden} onClose={() => this._onAckClose()}>
                <HeadingText><strong>Acknowledge Incident</strong></HeadingText>
                <TextField type={TextField.TYPE.PASSWORD} value={adminKey || ""} onChange={(e) => this.setState({adminKey: e.target.value})} label="Admin API Key"/>
                <Button type={Button.TYPE.PRIMARY} className="modalBtn" onClick={() => this.ackIncident(adminKey)}>Acknowledge</Button>
                <Button type={Button.TYPE.DESTRUCTIVE} className="modalBtn" onClick={this._onAckClose}>Close</Button>
              </Modal>
            </TabsItem>
          </Tabs>
        </div>
    }

    return (
      <>
      <Configurator
          schema={this.schema}   // schema for the config form data
          uiSchema={this.uischema}                             // ui schema for the config form data
          data={config}                                       // this should be wired to the config data from this.state
          dataChangeHandler={(data)=>{this.updateData(data)}}      // callback function run when config changes

          accountId={this.accountId}                                 // master account
          storageCollectionId="AccountConfig"             // the nerdstorage collection name to store config
          documentId="accountConfig"                                 // the nerstorage document id prefix

          buttonTitle="Configuration"                         // Some customization of the configurator UI
          modalTitle="Account Editor"
          modalHelp="Use the form below to configure accounts to report violations on."
      />
      {config == false ? start : render}
      </>
    )
  }
}
